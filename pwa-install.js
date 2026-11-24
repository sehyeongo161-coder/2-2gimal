(() => {
  "use strict";
  let pending = null;
  const buttons = [...document.querySelectorAll("[data-pwa-install]")];
  const media = matchMedia("(display-mode: standalone)");
  const installed = () => media.matches || navigator.standalone === true;
  const sync = () => buttons.forEach(b => { b.hidden = installed(); });
  const help = () => {
    const dialog = document.getElementById("pwa-help");
    if (dialog && typeof dialog.showModal === "function") dialog.showModal();
    else alert("PC 또는 Android: 브라우저 메뉴에서 앱 설치 / 홈 화면에 추가. iPhone·iPad: Safari 공유 메뉴에서 홈 화면에 추가.");
  };
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    pending = event;
    sync();
  });
  window.addEventListener("appinstalled", () => {
    pending = null;
    buttons.forEach(b => { b.hidden = true; });
  });
  if (media.addEventListener) media.addEventListener("change", sync);
  buttons.forEach(b => b.addEventListener("click", async () => {
    if (!pending) { help(); return; }
    const prompt = pending;
    pending = null;
    buttons.forEach(button => { button.disabled = true; });
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") buttons.forEach(button => { button.hidden = true; });
    } catch (error) {
      console.warn("App installation prompt unavailable", error);
      help();
    } finally {
      buttons.forEach(button => { button.disabled = false; });
    }
  }));
  sync();
  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("./sw.js", {updateViaCache:"none"})
      .catch(error => console.warn("PWA service worker registration failed", error));
  }
})();
