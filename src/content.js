// content.js
(() => {
	// Cross-browser API alias
	const api = typeof browser !== "undefined" ? browser : chrome;

	// Prevent duplicate injection across reinjections
	if (window.__YTFULLCAP_BOOTED__) {
		console.log("[YTFULLCAP] duplicate injection ignored");
		return;
	}
	window.__YTFULLCAP_BOOTED__ = true;
	console.log("[YTFULLCAP] content.js loaded");

	// Store long-lived handles so we don't reattach observers/listeners
	const H = (window.__YTFULLCAP_HANDLES__ ||= {
		on: false,
		resizeObserver: null,
		fullscreenResizeObserver: null,
		activeClassObserver: null,
		stopMonitorMain: null,
		stopMonitorFull: null,
		hideTimeout: null,
	});

	api.runtime.onMessage.addListener(async (req) => {
		if (req.message === "turnOn") {
			if (H.on) {
				console.log("[YTFULLCAP] already ON, ignoring");
				return;
			}
			H.on = true;
			try {
				await turnOn();
			} catch (e) {
				console.error("[YTFULLCAP] turnOn failed:", e);
			}
		} else if (req.message === "turnOff") {
			location.reload();
		}
	});

	function waitForElement(selector, timeout = 30000) {
		return new Promise((resolve, reject) => {
			const intervalTime = 100;
			let elapsed = 0;
			const it = setInterval(() => {
				const el = document.querySelector(selector);
				if (el) {
					clearInterval(it);
					resolve(el);
				} else if (timeout !== -1 && elapsed > timeout) {
					clearInterval(it);
					reject(new Error(`Element "${selector}" not found within ${timeout}ms`));
				}
				elapsed += intervalTime;
			}, intervalTime);
		});
	}

	function adjustFontSize(entry, percentage, textElement, minPx, maxPx) {
		const containerWidth = entry.target.offsetWidth;
		let fontSize = containerWidth * (percentage / 100);
		fontSize = Math.max(minPx, Math.min(fontSize, maxPx));
		textElement.style.fontSize = fontSize + "px";
	}

	function monitorElementPosition(element, container, onOut, onIn) {
		let isOutside = false;
		const check = () => {
			const elemRect = element.getBoundingClientRect();
			const contRect = container.getBoundingClientRect();
			const outsideH = elemRect.right < contRect.left || elemRect.left > contRect.right;
			const outsideV = elemRect.bottom < contRect.top || elemRect.top > contRect.bottom;

			if ((outsideH || outsideV) && !isOutside) {
				isOutside = true; onOut(element);
			} else if (!outsideH && !outsideV && isOutside) {
				isOutside = false; onIn(element);
			}
		};

		document.addEventListener("mousemove", check);
		document.addEventListener("mouseup", check);
		window.addEventListener("resize", check);
		check();

		return () => {
			document.removeEventListener("mousemove", check);
			document.removeEventListener("mouseup", check);
			window.removeEventListener("resize", check);
		};
	}

	function makeDivDraggable(div) {
		let startY, startTopPercent, containerHeight;

		function onMouseDown(e) {
			startY = e.clientY;
			containerHeight = div.parentElement.offsetHeight;
			const startTop = parseInt(getComputedStyle(div).top, 10);
			startTopPercent = (startTop / containerHeight) * 100;
			document.addEventListener("mousemove", onMouseMove);
			document.addEventListener("mouseup", onMouseUp);
		}
		function onMouseMove(e) {
			const deltaY = e.clientY - startY;
			const newTopPercent = startTopPercent + (deltaY / containerHeight) * 100;
			div.style.top = newTopPercent + "%";
		}
		function onMouseUp() {
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);
		}

		div.addEventListener("mousedown", onMouseDown);
	}

	function redirectClickEventOnElement(element) {
		let isDragging = false;
		element.addEventListener("mousedown", () => { isDragging = false; });
		element.addEventListener("mousemove", () => { isDragging = true; });
		element.addEventListener("mouseup", (event) => {
			if (isDragging) return;
			event.preventDefault();
			const { clientX: x, clientY: y } = event;
			element.style.visibility = "hidden";
			const below = document.elementFromPoint(x, y);
			element.style.visibility = "visible";
			if (below) below.click();
		});
	}

	async function turnOn() {
		// Ensure CC is on
		await waitForElement("button.ytp-subtitles-button", -1);
		const ccBtn = document.querySelector('button.ytp-subtitles-button[aria-pressed="false"]');
		if (ccBtn) ccBtn.click();

		// Open transcript panel (if present)
		const transcriptBtnSel = "#structured-description .ytd-video-description-transcript-section-renderer button";
		try {
			await waitForElement(transcriptBtnSel, 8000);
			const transcriptBtn = document.querySelector(transcriptBtnSel);
			if (transcriptBtn) transcriptBtn.click();
		} catch {
			// Some videos have no transcript entry; continue gracefully
			console.warn("[YTFULLCAP] transcript button not found (continuing)");
		}

		// Main player container
		await waitForElement("#player", -1);
		await waitForElement(".caption-window.ytp-caption-window-bottom", -1);

		const player = document.querySelector("#player");
		let captionsContainer = player.querySelector(".youtube-full-captions-container");
		if (!captionsContainer) {
			captionsContainer = document.createElement("div");
			captionsContainer.classList.add("youtube-full-captions-container");
			captionsContainer.innerHTML = "<div class='youtube-full-captions-text'>Loading...</div>";
			player.appendChild(captionsContainer);

			redirectClickEventOnElement(captionsContainer);
			makeDivDraggable(captionsContainer);
		}
		const captionsText = captionsContainer.querySelector(".youtube-full-captions-text");

		// Fullscreen player container
		const fullPlayer = document.querySelector("#player-full-bleed-container");
		let fullCaptionsContainer = fullPlayer.querySelector(".youtube-full-captions-container");
		if (!fullCaptionsContainer) {
			fullPlayer.classList.add("youtube-full-captions-container-fullscreen");
			fullCaptionsContainer = captionsContainer.cloneNode(true);
			fullPlayer.appendChild(fullCaptionsContainer);
			makeDivDraggable(fullCaptionsContainer);
		}
		const fullCaptionsText = fullCaptionsContainer.querySelector(".youtube-full-captions-text");

		// Apply outside/inside class toggling once
		if (!H.stopMonitorMain) {
			H.stopMonitorMain = monitorElementPosition(
				captionsText,
				player,
				(el) => el.classList.add("outside-container"),
				(el) => el.classList.remove("outside-container")
			);
		}
		if (!H.stopMonitorFull) {
			H.stopMonitorFull = monitorElementPosition(
				fullCaptionsText,
				fullPlayer,
				(el) => el.classList.add("outside-container"),
				(el) => el.classList.remove("outside-container")
			);
		}

		// Resize observers once
		if (!H.resizeObserver) {
			H.resizeObserver = new ResizeObserver((entries) => {
				for (const entry of entries) {
					adjustFontSize(entry, 3, captionsText, 13.71, 27.35);
				}
			});
			H.resizeObserver.observe(player);
		}
		if (!H.fullscreenResizeObserver) {
			H.fullscreenResizeObserver = new ResizeObserver((entries) => {
				for (const entry of entries) {
					adjustFontSize(entry, 3, fullCaptionsText, 13.71, 35);
				}
			});
			H.fullscreenResizeObserver.observe(fullPlayer);
		}

		const allCaptionTexts = document.querySelectorAll(
			".youtube-full-captions-container .youtube-full-captions-text"
		);

		function copyContents() {
			const active = document.querySelector(".ytd-transcript-segment-list-renderer.active");
			if (!active) return;
			allCaptionTexts.forEach((el) => {
				if (H.hideTimeout !== null) clearTimeout(H.hideTimeout);
				el.style.display = "block";
				const src = active.querySelector("yt-formatted-string");
				el.innerHTML = src ? src.innerHTML : "";
				H.hideTimeout = setTimeout(() => {
					el.style.display = "none";
				}, 7000);
			});
		}

		// Observe transcript list once (if present)
		try {
			await waitForElement("#segments-container.ytd-transcript-segment-list-renderer", 10000);
			if (!H.activeClassObserver) {
				const parent = document.querySelector("#segments-container.ytd-transcript-segment-list-renderer");
				H.activeClassObserver = new MutationObserver((mutations) => {
					for (const m of mutations) {
						if (m.type === "attributes" && m.attributeName === "class") {
							copyContents();
							break;
						}
					}
				});
				H.activeClassObserver.observe(parent, { attributes: true, childList: true, subtree: true });
			}
		} catch {
			console.warn("[YTFULLCAP] transcript segments not found (continuing)");
		}
	}
})();
