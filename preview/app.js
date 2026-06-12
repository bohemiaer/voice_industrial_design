const shell = document.querySelector("[data-workbench]");
const toggleButton = document.querySelector("[data-action='toggle-panel']");

if (shell && toggleButton) {
  toggleButton.addEventListener("click", () => {
    const nextState =
      shell.dataset.panelState === "expanded" ? "collapsed" : "expanded";

    shell.dataset.panelState = nextState;
    toggleButton.setAttribute("aria-expanded", String(nextState === "expanded"));
    toggleButton.setAttribute(
      "aria-label",
      nextState === "expanded" ? "收起右侧面板" : "展开右侧面板",
    );
  });
}
