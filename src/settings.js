// --- Defaults (also the "Classic" preset) ---
const DEFAULTS = {
	fontScale: 1.0,
	fontPreset: "system-sans",
	fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
	fontColor: "#ffffff",
	fontWeight: "500",
	bgOpacity: 0.61
};
const PRESETS = {
	Minimalistic: {
		fontScale: 0.9,
		fontPreset: "system-sans",
		fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
		fontColor: "#ffffff",
		fontWeight: "100",
		bgOpacity: 0.15
	},
	Classic: { ...DEFAULTS },
	HighContrast: {
		fontScale: 1.5,
		fontPreset: "system-sans",
		fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
		fontColor: "#ffd400",
		fontWeight: "700",
		bgOpacity: 0.9
	}
};

const api = typeof browser !== "undefined" ? browser : chrome;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function presetToFamily(preset) {
	switch (preset) {
		case "inherit":      return null;
		case "system-serif": return "ui-serif, Georgia, 'Times New Roman', Times, serif";
		case "system-mono":  return "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";
		case "system-sans":
		default:             return "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
	}
}
function debounce(fn, ms=120){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
async function storageGet(keys) { return await api.storage.sync.get(keys); }
async function storageSet(obj) { return await api.storage.sync.set(obj); }

const presetSelect   = document.querySelector("#presetSelect");
const fontScaleEl    = document.querySelector("#fontScale");
const fontScaleValEl = document.querySelector("#fontScaleVal");
const fontPresetEl   = document.querySelector("#fontPreset");
const fontColorEl    = document.querySelector("#fontColor");
const fontColorHex   = document.querySelector("#fontColorHex");
const fontWeightEl   = document.querySelector("#fontWeight");
const bgOpacityEl    = document.querySelector("#bgOpacity");
const bgOpacityValEl = document.querySelector("#bgOpacityVal");

function showScaleLabel(v) {
	const num = clamp(Number(v) || 1, 0.5, 2);
	fontScaleValEl.textContent = num.toFixed(2) + "×";
}
function showOpacityLabel(v) {
	const num = clamp(Number(v) || 0, 0, 1);
	if (bgOpacityValEl) bgOpacityValEl.textContent = Math.round(num * 100) + "%";
}

let fontFamilyCached = DEFAULTS.fontFamily;

function buildCfgFromUI() {
	const preset   = fontPresetEl.value;
	const resolved = presetToFamily(preset);
	return {
		fontScale: clamp(parseFloat(fontScaleEl.value), 0.5, 2),
		fontPreset: preset,
		fontFamily: resolved ?? fontFamilyCached,
		fontColor: (fontColorEl.value || DEFAULTS.fontColor).toLowerCase(),
		fontWeight: fontWeightEl.value,
		bgOpacity: clamp(parseFloat(bgOpacityEl.value), 0, 1)
	};
}

function applyCfgToUI(cfg) {
	fontScaleEl.value  = cfg.fontScale;
	showScaleLabel(cfg.fontScale);
	fontPresetEl.value = cfg.fontPreset;
	fontColorEl.value  = cfg.fontColor;
	fontColorHex.value = cfg.fontColor;
	fontWeightEl.value = cfg.fontWeight;
	bgOpacityEl.value  = cfg.bgOpacity;
	showOpacityLabel(cfg.bgOpacity);
}

async function writeAndBroadcast() {
	const cfg = buildCfgFromUI();
	fontFamilyCached = cfg.fontFamily;

	await storageSet(cfg);
	await storageSet({ currentPreset: cfg });

	const tabs = await api.tabs.query({ url: "*://*.youtube.com/*" });
	await Promise.all((tabs || []).map(async (t) => {
		try {
			await api.tabs.sendMessage(t.id, { message: "ytfc:applySettings" });
		} catch (_) {}
	}));
}

const saveAndBroadcast = debounce(writeAndBroadcast, 120);

async function loadCurrentIntoUI() {
	const data = await storageGet(["currentPreset", ...Object.keys(DEFAULTS)]);
	const current = data.currentPreset
		? { ...DEFAULTS, ...data.currentPreset }
		: { ...DEFAULTS, ...data };
	fontFamilyCached = current.fontFamily;
	applyCfgToUI(current);
	if (presetSelect) presetSelect.value = "Current";
}

if (presetSelect) {
	presetSelect.addEventListener("change", async () => {
		const choice = presetSelect.value;
		if (choice === "Current") {
			await loadCurrentIntoUI();
		} else {
			const presetCfg = PRESETS[choice] || DEFAULTS;
			applyCfgToUI(presetCfg);
			await writeAndBroadcast();
		}
	});
}

fontScaleEl.addEventListener("input",  () => { showScaleLabel(fontScaleEl.value); saveAndBroadcast(); });
fontPresetEl.addEventListener("change", saveAndBroadcast);
fontWeightEl.addEventListener("change", saveAndBroadcast);
bgOpacityEl.addEventListener("input",   () => { showOpacityLabel(bgOpacityEl.value); saveAndBroadcast(); });

fontColorEl.addEventListener("input", () => {
	fontColorHex.value = (fontColorEl.value || "").toLowerCase();
	saveAndBroadcast();
});
fontColorHex.addEventListener("input", () => {
	const v = fontColorHex.value.trim();
	if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) {
		fontColorEl.value = v.toLowerCase();
		saveAndBroadcast();
	}
});

loadCurrentIntoUI();
