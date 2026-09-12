const fields = ["mortar-x", "mortar-z", "target-x", "target-z"].map((id) =>
  document.getElementById(id)
);
const distanceEl = document.getElementById("distance");
const hintEl = document.getElementById("hint");
const clearBtn = document.getElementById("clear");

function parseCoord(value) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function formatMetres(metres) {
  return `${metres.toLocaleString("en-US", { maximumFractionDigits: 0 })} m`;
}

function update() {
  const coords = fields.map((input) => parseCoord(input.value));
  const ready = coords.every((n) => n !== null);

  if (!ready) {
    distanceEl.textContent = "—";
    distanceEl.classList.remove("is-ready");
    hintEl.hidden = true;
    return;
  }

  const [mx, mz, tx, tz] = coords;
  const metres = Math.round(Math.hypot(tx - mx, tz - mz) * 100);

  distanceEl.textContent = formatMetres(metres);
  distanceEl.classList.add("is-ready");
  hintEl.hidden = false;
}

function clearAll() {
  for (const input of fields) input.value = "";
  fields[0].focus();
  update();
}

for (const input of fields) {
  input.addEventListener("input", update);
  input.addEventListener("focus", () => input.select());
}

clearBtn.addEventListener("click", clearAll);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    clearAll();
  }
});

hintEl.hidden = true;
update();
