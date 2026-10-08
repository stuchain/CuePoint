import { BUG_FIELDS, CONTACT_FIELDS, HONEYPOT, isHoneypotFilled, isTooFast, validateFields, type FieldSpec, type FieldValues } from "./forms";

/**
 * The browser side of the contact and bug-report forms (SITE-12). The forms work without it: they are
 * plain HTML that posts to Web3Forms. With it, a form checks its fields (each message under its field,
 * linked by aria-describedby, the first wrong field focused), sends in the background, and shows the
 * thank-you page. A failed send keeps what was typed and offers the email address.
 *
 * The form-sent event is dispatched on document for analytics-client.ts; it carries only the form's name.
 */
export const FORM_SENT_EVENT = "cuepoint:form-sent";

const SPECS: Record<string, readonly FieldSpec[]> = { contact: CONTACT_FIELDS, bug: BUG_FIELDS };

function init(form: HTMLFormElement) {
  const specs = SPECS[form.dataset["form"] ?? ""];
  if (!specs) return;
  const shownAt = Date.now();
  // our own messages replace the browser's, which differ from browser to browser
  form.noValidate = true;
  const summary = form.querySelector<HTMLElement>("#form-summary");
  const status = form.querySelector<HTMLElement>("[data-form-status]");
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const idleLabel = button?.textContent ?? "";

  const control = (name: string) => form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`#${name}`);
  const values = (): FieldValues => {
    const out: Record<string, string> = {};
    for (const [key, value] of new FormData(form).entries()) if (typeof value === "string") out[key] = value;
    return out;
  };

  function show(name: string, message: string | undefined) {
    const field = control(name);
    const line = form.querySelector<HTMLElement>(`#${name}-error`);
    if (!field || !line) return;
    line.textContent = message ?? "";
    line.hidden = !message;
    if (message) field.setAttribute("aria-invalid", "true");
    else field.removeAttribute("aria-invalid");
  }

  function showAll(errors: Record<string, string>) {
    for (const spec of specs!) show(spec.name, errors[spec.name]);
    const names = Object.keys(errors);
    if (summary) summary.textContent = names.length === 0 ? "" : names.length === 1 ? "Check the field marked below, then send again." : `Check the ${names.length} fields marked below, then send again.`;
    if (names[0]) control(names[0])?.focus();
  }

  // a field that is wrong is checked again as the person fixes it, so its message goes when it is right
  const recheck = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (!target?.id || target.getAttribute("aria-invalid") !== "true") return;
    const spec = specs.find((s) => s.name === target.id);
    if (!spec) return;
    show(spec.name, validateFields([spec], values())[spec.name]);
    if (summary && form.querySelector('[aria-invalid="true"]') === null) summary.textContent = "";
  };
  form.addEventListener("input", recheck);
  form.addEventListener("change", recheck);

  function fail() {
    if (!status) return;
    const noun = form.dataset["noun"] ?? "message";
    const email = form.dataset["email"] ?? "";
    status.hidden = false;
    status.replaceChildren();
    status.append(
      `Sorry, we could not send your ${noun}. What you typed is still here, so you can try again. Or write to `,
    );
    const link = document.createElement("a");
    link.href = `mailto:${email}`;
    link.textContent = email;
    status.append(link, ".");
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (status) status.hidden = true;
    const current = values();
    const errors = validateFields(specs, current);
    showAll(errors);
    if (Object.keys(errors).length > 0) return;

    const thanks = form.dataset["thanks"] ?? "/";
    // a robot filled the hidden field, or sent faster than a person can type: drop the send, and let it think it worked
    if (isHoneypotFilled({ [HONEYPOT]: current[HONEYPOT] }) || isTooFast(shownAt, Date.now())) {
      location.assign(thanks);
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent = "Sending…";
    }
    form.setAttribute("aria-busy", "true");
    let sent = false;
    try {
      // `redirect` is for the no-script post only; the fetch send stays on the page and goes to the thank-you page itself
      const data = new FormData(form);
      data.delete("redirect");
      const response = await fetch(form.action, { method: "POST", body: data, headers: { Accept: "application/json" } });
      const body = (await response.json().catch(() => ({}))) as { success?: boolean };
      sent = response.ok && body.success === true;
    } catch {
      sent = false;
    }

    if (sent) {
      document.dispatchEvent(new CustomEvent(FORM_SENT_EVENT, { detail: { form: form.dataset["form"] } }));
      location.assign(thanks);
      return;
    }
    form.removeAttribute("aria-busy");
    if (button) {
      button.disabled = false;
      button.textContent = idleLabel;
    }
    fail();
  });
}

for (const form of document.querySelectorAll<HTMLFormElement>("form[data-form]")) init(form);
