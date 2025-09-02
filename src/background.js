// background.js (MV2, Firefox)
let tabStates = {};

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
		} else {
			// OFF: reload tab
			chrome.tabs.reload(tab.id);
			state.active = false;
		}
	} catch (e) {
		console.error("[YTFULLCAP] injection failed:", e);
	}
});

// cleanup/reset on close/reload
chrome.tabs.onRemoved.addListener((tabId) => delete tabStates[tabId]);
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
	if (changeInfo.status === "loading") delete tabStates[tabId];
});
