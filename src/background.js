const api = typeof browser !== "undefined" ? browser : chrome;

const ICONS_OFF = {16:"images/icon-16.png",32:"images/icon-32.png",48:"images/icon-48.png",128:"images/icon-128.png"};
const ICONS_ON  = {16:"images/icon-on-16.png",32:"images/icon-on-32.png",48:"images/icon-on-48.png",128:"images/icon-on-128.png"};
const activeTabs = new Map();

function isYouTube(url) {
  return /:\/\/(www\.)?youtube\.com\//i.test(url || "");
}

async function setActive(tabId, active) {
  if (active) activeTabs.set(tabId, true);
  else activeTabs.delete(tabId);

  await api.action.setIcon({ tabId, path: active ? ICONS_ON : ICONS_OFF });
  await api.action.setTitle({
    tabId,
    title: active
      ? "YouTube Full Captions — ON (click to turn OFF)"
      : "YouTube Full Captions — OFF (click to turn ON)"
  });
}

function isActive(tabId) {
  return !!activeTabs.get(tabId);
}

async function resetTabUi(tabId) {
  activeTabs.delete(tabId);
  try {
    await api.action.setIcon({ tabId, path: ICONS_OFF });
    await api.action.setTitle({ tabId, title: "YouTube Full Captions — OFF (click to turn ON)" });
    await api.action.setBadgeText({ tabId, text: "" });
  } catch (_) {}
}

api.runtime.onInstalled.addListener(() => {
  try {
    api.contextMenus.create({
      id: "ytfc-settings",
      title: "Caption Settings…",
      contexts: ["action"]
    });
  } catch (e) {
    console.warn("[YTFULLCAP] context menu create failed:", e);
  }
});

api.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== "ytfc-settings") return;
  api.runtime.openOptionsPage().catch((e) => {
    console.error("[YTFULLCAP] openOptionsPage failed:", e);
  });
});

api.action.onClicked.addListener(async (tab) => {
  if (!tab || !isYouTube(tab.url)) {
    if (tab?.id != null) {
      await api.action.setBadgeText({ tabId: tab.id, text: "!" });
      setTimeout(() => {
        api.action.setBadgeText({ tabId: tab.id, text: "" }).catch(() => {});
      }, 800);
    }
    return;
  }

  if (!isActive(tab.id)) {
    try {
      await api.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      await api.scripting.insertCSS({ target: { tabId: tab.id }, files: ["content.css"] });
      await api.tabs.sendMessage(tab.id, { message: "turnOn" });
      await setActive(tab.id, true);
    } catch (e) {
      console.error("[YTFULLCAP] inject failed:", e);
    }
  } else {
    try {
      await api.tabs.reload(tab.id);
    } finally {
      await setActive(tab.id, false);
    }
  }
});

api.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    await resetTabUi(tabId);
  }
});

api.tabs.onRemoved.addListener((tabId) => {
  activeTabs.delete(tabId);
});
