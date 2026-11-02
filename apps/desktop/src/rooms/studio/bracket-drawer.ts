/** The mounted Map Room lends its drawer opener to the shared action table. */
let opener: (() => void) | undefined;
export const bracketDrawer = {
  mount(open: () => void) {
    opener = open;
    return () => { if (opener === open) opener = undefined; };
  },
  open() { opener?.(); },
};
