const controls = document.querySelector(".gallery-controls");
const selectors = [...document.querySelectorAll("[data-example]")];
const examples = [...document.querySelectorAll(".example")];

function selectExample(id) {
  for (const button of selectors) {
    button.setAttribute("aria-pressed", String(button.dataset.example === id));
  }
  for (const example of examples) {
    example.hidden = example.id !== `example-${id}`;
  }
}

if (controls && selectors.length && examples.length) {
  selectExample(selectors[0].dataset.example);
  controls.hidden = false;
  for (const button of selectors) {
    button.addEventListener("click", () => selectExample(button.dataset.example));
  }
}

const status = document.querySelector(".copy-status");
let statusTimeout;
function announce(message) {
  clearTimeout(statusTimeout);
  status.textContent = message;
  statusTimeout = setTimeout(() => { status.textContent = ""; }, 8000);
}

for (const button of document.querySelectorAll("[data-copy]")) {
  button.hidden = false;
  button.addEventListener("click", async () => {
    const source = document.getElementById(button.dataset.copy);
    if (!navigator.clipboard?.writeText) {
      announce(status.dataset.unavailable);
      return;
    }
    button.disabled = true;
    try {
      await navigator.clipboard.writeText(source.textContent);
      announce(status.dataset.copied);
    } catch (error) {
      console.warn("Clipboard write failed:", error);
      announce(status.dataset.failed);
    } finally {
      button.disabled = false;
    }
  });
}
