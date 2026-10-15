import type { ComponentPropsWithRef, ReactElement, ReactNode } from "react";
import { PixelIcon } from "./PixelIcon";
import { PIXEL_ICONS, type PixelIconName } from "./pixelIcons";
import "./Button.css";

/**
 * One standard look (`.cp-btn`) and six roles:
 * - `primary`: violet fill; at most one per area.
 * - `secondary` (also `standard`): neutral grey; the default for everything else.
 * - `write`: green fill, for the buttons that write to the user's files (Sync to files, Save to
 *   files, Export to Rekordbox, Write tags).
 * - `danger`: red outline, for a destructive action that opens a question or acts at once.
 * - `danger-confirm`: red fill; only the confirm button of a delete dialog.
 * - `quiet`: text only ("More about this", "See every change").
 */
export type ButtonVariant =
    | "primary"
    | "secondary"
    | "standard"
    | "write"
    | "danger"
    | "danger-confirm"
    | "quiet";

interface ButtonBaseProps extends Omit<ComponentPropsWithRef<"button">, "children"> {
    variant?: ButtonVariant;
    loading?: boolean;
    /** `"sm"` is for rows and chips (T12): 80% of the control height. */
    size?: "sm";
}

interface LabelledButtonProps extends ButtonBaseProps {
    iconOnly?: false;
    /** A pixel icon by name, or an element. */
    icon?: ReactElement | PixelIconName;
    children?: ReactNode;
}

/** A button that is only its icon (T10): it has no words, so it must be named. */
interface IconOnlyButtonProps extends ButtonBaseProps {
    iconOnly: true;
    icon: ReactElement | PixelIconName;
    "aria-label": string;
    children?: never;
}

export type ButtonProps = LabelledButtonProps | IconOnlyButtonProps;

function drawIcon(icon: ReactElement | PixelIconName): ReactNode {
    if (
        typeof icon === "string" &&
        Object.prototype.hasOwnProperty.call(PIXEL_ICONS, icon)
    ) {
        return <PixelIcon name={icon as PixelIconName} />;
    }
    return icon;
}

export function Button(props: ButtonProps) {
    const {
        variant = "primary",
        loading = false,
        size,
        icon,
        iconOnly = false,
        children,
        className = "",
        disabled,
        ...rest
    } = props;
    const isDisabled = disabled || loading;
    const look = variant === "standard" ? "secondary" : variant;
    const classes = [
        "cp-btn",
        `cp-btn--${look}`,
        iconOnly ? "cp-btn--icon" : "",
        size === "sm" ? "cp-btn--sm" : "",
        loading ? "cp-btn--loading" : "",
        className,
    ]
        .filter(Boolean)
        .join(" ");
    return (
        <button
            type="button"
            className={classes}
            disabled={isDisabled}
            aria-busy={iconOnly && loading ? true : undefined}
            {...rest}
        >
            {icon && <span className="cp-btn__icon">{drawIcon(icon)}</span>}
            {!iconOnly && (
                <span className="cp-btn__label">
                    {loading ? "…" : children}
                </span>
            )}
        </button>
    );
}
