// background.js (MV2, Firefox)
let tabStates = {};

const ICONS_OFF = {
	16:  "images/icon-16.png",
	32:  "images/icon-32.png",
	48:  "images/icon-48.png",
	128: "images/icon-128.png",
};
const ICONS_ON = {
	16:  "images/icon-on-16.png",
	32:  "images/icon-on-32.png",
	48:  "images/icon-on-48.png",
	128: "images/icon-on-128.png",
};

function syncIcon(tabId) {
	const active = !!(tabStates[tabId] && tabStates[tabId].active);
	chrome.browserAction.setIcon({ tabId, path: active ? ICONS_ON : ICONS_OFF });
	chrome.browserAction.setTitle({
		tabId,
		title: active
			? "YouTube Full Captions — ON (click to turn OFF)"
			: "YouTube Full Captions — OFF (click to turn ON)",
	});
}

function execScript(tabId, file) {
	return new Promise((resolve, reject) => {
		chrome.tabs.executeScript(tabId, { file }, () => {
			if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
			resolve();
		});
	});
}

function insertCss(tabId, file) {
	return new Promise((resolve, reject) => {
		chrome.tabs.insertCSS(tabId, { file }, () => {
			if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
			resolve();
		});
	});
}

chrome.browserAction.onClicked.addListener(async (tab) => {
	try {
		const state = (tabStates[tab.id] ||= { active: false });

		if (!state.active) {
			// ON: inject, then message
			await execScript(tab.id, "content.js");
			await insertCss(tab.id, "content.css");
			chrome.tabs.sendMessage(tab.id, { message: "turnOn" });
			state.active = true;
			syncIcon(tab.id);
		} else {
			// OFF: reload tab
			chrome.tabs.reload(tab.id);
			state.active = false;
			syncIcon(tab.id);
		}
	} catch (e) {
		console.error("[YTFULLCAP] injection failed:", e);
	}
});

// Keep icon state accurate on tab changes/reloads/close
chrome.tabs.onActivated.addListener(({ tabId }) => syncIcon(tabId));
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
	if (changeInfo.status === "loading") {
		delete tabStates[tabId];   // reset on reload (your earlier logic)
		syncIcon(tabId);           // show OFF icon during load
	}
});
chrome.tabs.onRemoved.addListener((tabId) => { delete tabStates[tabId]; });