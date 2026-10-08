/** IME keyCode 229 is still used by browsers during composition commit. */
export function shouldSubmitKey(
  event: {
    key: string;
    shiftKey: boolean;
    isComposing: boolean;
    keyCode: number;
  },
  finePointer: boolean,
) {
  return (
    finePointer &&
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.isComposing &&
    event.keyCode !== 229
  );
}
