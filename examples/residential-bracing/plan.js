document.querySelector("#axis").addEventListener("change", event => {
  for (const item of document.querySelectorAll("[data-axis]")) {
    item.toggleAttribute("hidden", event.target.value !== "all" && item.dataset.axis !== event.target.value);
  }
});
