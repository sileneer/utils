export function keyboardViewport(input: {
    height: number;
    top: number;
    scale: number;
    layoutHeight: number;
    mobile: boolean;
    textFocused: boolean;
}) {
    if (!input.mobile || !input.textFocused || Math.abs(input.scale - 1) > 0.01 ||
        !Number.isFinite(input.height) || !Number.isFinite(input.top) ||
        input.height < 100 || input.top < 0 || input.layoutHeight - input.height < 80)
        return;
    return { height: input.height, top: input.top };
}
