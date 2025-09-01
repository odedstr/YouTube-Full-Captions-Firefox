let script_inserted = false;
let full_captions_active = false;

chrome.browserAction.onClicked.addListener((tab) => {
	if (!script_inserted) {
		script_inserted = true;

		chrome.tabs.executeScript(tab.id, { file: "content.js" });
	}

	if (!full_captions_active) {
		full_captions_active = true;

		chrome.tabs.removeCSS(tab.id, { file: "content.css" }, () => {
			chrome.tabs.insertCSS(tab.id, { file: "content.css" });
		});

		chrome.tabs.sendMessage(tab.id, { message: "turnOn" });
	} else {
		chrome.tabs.removeCSS(tab.id, { file: "content.css" });

		chrome.tabs.sendMessage(tab.id, { message: "turnOff" });
		full_captions_active = false;
	}
});
