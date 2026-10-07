import { cancelledError, jobFailureError } from "../../reporting/expected";
import { followJob } from "./followJob";
import { jobErrorMessage } from "./libraryFormat";

/** The result a finished job answered, or a sentence saying why there is none. */
export async function jobResult<T>(jobId: string): Promise<T> {
  const handle = followJob(jobId);
  const finished = await handle.finished;
  if (finished.state === "failed") throw jobFailureError(jobErrorMessage(finished.error), finished.error);
  const read = window.cuepoint?.getJobResults;
  if (!read) throw new Error("The engine is not connected.");
  const payload = await read(jobId);
  if (payload.result == null) {
    // A job the user stopped is not a failure; one that answered nothing is.
    throw finished.state === "cancelled"
      ? cancelledError("Stopped before it had an answer.")
      : new Error("The job answered nothing.");
  }
  return payload.result as T;
}
