window.__ModuleLoader__.load({ id: "dsh-self-update", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
//#region rolldown:runtime
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));

//#endregion
let react = require("react");
react = __toESM(react);
let react_dom = require("react-dom");
react_dom = __toESM(react_dom);
let react_jsx_runtime = require("react/jsx-runtime");
react_jsx_runtime = __toESM(react_jsx_runtime);

//#region src/client/api.ts
/** 自更新不可用（非 git 工作副本）时返回 undefined —— 席位据此整个不渲染。 */
async function fetchUpdateStatus() {
	try {
		const res = await fetch("/self-update/api/update/status");
		if (!res.ok) return void 0;
		return await res.json();
	} catch {
		return;
	}
}
async function postUpdate(action) {
	try {
		const res = await fetch(`/self-update/api/update/${action}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{}"
		});
		if (!res.ok) return void 0;
		return await res.json();
	} catch {
		return;
	}
}

//#endregion
//#region src/client/UpdateAction.tsx
const DISMISS_KEY = "dsh-self-update.dismissedSha";
const OPEN_UPDATE_EVENT = "dsh-self-update:open";
function openUpdatePanel(opts) {
	window.dispatchEvent(new CustomEvent(OPEN_UPDATE_EVENT, { detail: { check: opts?.check === true } }));
}
const T$1 = {
	text: "var(--dsw-alias-label-primary)",
	text2: "var(--dsw-alias-label-secondary)",
	text3: "var(--dsw-alias-label-tertiary)",
	border: "var(--dsw-alias-border-l2)",
	layer: "var(--dsw-alias-bg-layer-1)",
	layer2: "var(--dsw-alias-bg-layer-2)",
	brand: "var(--dsw-alias-brand-primary)",
	primaryFill: "var(--dsw-alias-button-primary-fill)",
	primaryText: "var(--dsw-alias-label-primary-foreground)",
	ok: "var(--dsw-alias-state-success-primary)",
	err: "var(--dsw-alias-state-error-primary)"
};
const BTN = {
	fontSize: 13,
	lineHeight: "20px",
	padding: "6px 14px",
	borderRadius: 8,
	border: `1px solid ${T$1.border}`,
	background: "transparent",
	color: T$1.text2,
	cursor: "pointer"
};
const BTN_PRIMARY = {
	...BTN,
	background: T$1.primaryFill,
	color: T$1.primaryText,
	border: "none",
	fontWeight: 500
};
function readDismissed() {
	try {
		return window.localStorage.getItem(DISMISS_KEY) ?? void 0;
	} catch {
		return;
	}
}
/** 关键帧只能写在样式表里，内联 style 表达不了——挂一次，全组件共用。 */
const KEYFRAMES = `
@keyframes dsu-spin { to { transform: rotate(360deg) } }
@keyframes dsu-check { from { stroke-dashoffset: 16 } to { stroke-dashoffset: 0 } }
`;
/**
* 步骤指示圈：待执行 = 空心圈，执行中 = 旋转弧，完成 = 打勾（描边动画画出来），
* 失败 = ✕，跳过 = 虚线圈。三态共用同一个 16px 位置，不会跳版。
*/
function StepDot({ state }) {
	const box = {
		width: 16,
		height: 16,
		flex: "none",
		display: "block"
	};
	if (state === "running") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
		style: {
			...box,
			animation: "dsu-spin 900ms linear infinite"
		},
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-label": "执行中",
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
			cx: "8",
			cy: "8",
			r: "6.5",
			stroke: T$1.border,
			strokeWidth: "1.6"
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
			d: "M8 1.5a6.5 6.5 0 0 1 6.5 6.5",
			stroke: T$1.brand,
			strokeWidth: "1.6",
			strokeLinecap: "round"
		})]
	});
	if (state === "ok") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
		style: box,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-label": "完成",
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
			cx: "8",
			cy: "8",
			r: "6.5",
			stroke: T$1.ok,
			strokeWidth: "1.6"
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
			d: "M4.8 8.2l2.2 2.2 4.2-4.4",
			stroke: T$1.ok,
			strokeWidth: "1.7",
			strokeLinecap: "round",
			strokeLinejoin: "round",
			strokeDasharray: "16",
			style: { animation: "dsu-check 260ms ease-out both" }
		})]
	});
	if (state === "failed") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
		style: box,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-label": "失败",
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
			cx: "8",
			cy: "8",
			r: "6.5",
			stroke: T$1.err,
			strokeWidth: "1.6"
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
			d: "M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4",
			stroke: T$1.err,
			strokeWidth: "1.6",
			strokeLinecap: "round"
		})]
	});
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
		style: box,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-label": state === "skipped" ? "已跳过" : "待执行",
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
			cx: "8",
			cy: "8",
			r: "6.5",
			stroke: T$1.border,
			strokeWidth: "1.6",
			strokeDasharray: state === "skipped" ? "3 3" : void 0
		})
	});
}
const PLAN = [
	{
		cmd: "git pull --ff-only",
		why: "拉取新版本源码"
	},
	{
		cmd: "pnpm install",
		why: "同步依赖"
	},
	{
		cmd: "pnpm build",
		why: "重建前端（dist 不在仓库里，必须重建）"
	}
];
/** 版本对照块：当前 → 目标 */
function VersionCompare({ status }) {
	const col = {
		flex: "1 1 0",
		minWidth: 0
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		style: {
			display: "flex",
			alignItems: "stretch",
			gap: 12,
			background: T$1.layer2,
			border: `1px solid ${T$1.border}`,
			borderRadius: 10,
			padding: "12px 14px"
		},
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: col,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							color: T$1.text3,
							fontSize: 12
						},
						children: "当前版本"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							color: T$1.text,
							fontSize: 17,
							fontWeight: 600,
							margin: "2px 0"
						},
						children: status.current.version
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							color: T$1.text3,
							fontSize: 12,
							overflow: "hidden",
							textOverflow: "ellipsis"
						},
						children: [
							status.current.shortSha,
							" · ",
							status.branch
						]
					})
				]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					alignSelf: "center",
					color: T$1.text3,
					fontSize: 18
				},
				children: "→"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: col,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							color: T$1.text3,
							fontSize: 12
						},
						children: "新版本"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							color: T$1.brand,
							fontSize: 17,
							fontWeight: 600,
							margin: "2px 0"
						},
						children: status.available?.version ?? "—"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							color: T$1.text3,
							fontSize: 12
						},
						children: status.available !== void 0 ? `落后 ${status.available.behind} 个提交` : ""
					})
				]
			})
		]
	});
}
function UpdateAction({ wide }) {
	const [status, setStatus] = (0, react.useState)(void 0);
	const [dismissed, setDismissed] = (0, react.useState)(() => readDismissed());
	const [open, setOpen] = (0, react.useState)(false);
	const [busy, setBusy] = (0, react.useState)(false);
	const timer = (0, react.useRef)(void 0);
	const refresh = (0, react.useCallback)(async () => {
		setStatus(await fetchUpdateStatus());
	}, []);
	(0, react.useEffect)(() => {
		refresh();
		const fast = open || status?.phase === "installing";
		timer.current = setInterval(() => {
			refresh();
		}, fast ? 2e3 : 3e5);
		return () => {
			if (timer.current !== void 0) clearInterval(timer.current);
		};
	}, [
		refresh,
		open,
		status?.phase
	]);
	(0, react.useEffect)(() => {
		if (!open) return;
		const onKey = (e) => {
			if (e.key === "Escape") setOpen(false);
		};
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("keydown", onKey);
		};
	}, [open]);
	const act = (0, react.useCallback)(async (action) => {
		setBusy(true);
		try {
			const next = await postUpdate(action);
			if (next !== void 0) setStatus(next);
			if (action === "restart") setTimeout(() => {
				window.location.reload();
			}, 4e3);
		} finally {
			setBusy(false);
		}
	}, []);
	(0, react.useEffect)(() => {
		const onOpen = (e) => {
			setOpen(true);
			if (e.detail?.check === true) act("check");
			else refresh();
		};
		window.addEventListener(OPEN_UPDATE_EVENT, onOpen);
		return () => {
			window.removeEventListener(OPEN_UPDATE_EVENT, onOpen);
		};
	}, [act, refresh]);
	const available = status?.available;
	const installing = status?.phase === "installing";
	const needsRestart = status?.restartRequired === true;
	const failed = status?.phase === "failed" && status.steps.length > 0;
	const blocked = status?.dirty === true || status?.diverged === true;
	const upToDate = !installing && !needsRestart && !failed && available === void 0;
	const silent = status === void 0 || !installing && !needsRestart && !failed && (available === void 0 || dismissed !== void 0 && dismissed === available.sha);
	if (silent && !open) return null;
	const dismiss = () => {
		if (available === void 0) return;
		try {
			window.localStorage.setItem(DISMISS_KEY, available.sha);
		} catch {}
		setDismissed(available.sha);
		setOpen(false);
	};
	const rowLabel = needsRestart ? "更新已装好" : installing ? "正在更新…" : failed ? "更新失败" : `新版本 ${available?.version ?? ""}`;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [!silent && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
		type: "button",
		title: rowLabel,
		onClick: () => {
			setOpen(true);
		},
		style: {
			display: "flex",
			alignItems: "center",
			gap: 8,
			flex: "1 1 auto",
			minWidth: 0,
			boxSizing: "border-box",
			margin: "0 0 4px",
			padding: "7px 10px",
			borderRadius: 8,
			border: "none",
			background: "transparent",
			color: T$1.text2,
			fontSize: 13,
			lineHeight: "20px",
			cursor: "pointer",
			textAlign: "left",
			justifyContent: wide ? "flex-start" : "center"
		},
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
			style: {
				position: "relative",
				display: "inline-flex",
				flex: "none"
			},
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "16",
				height: "16",
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": true,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M8 2.5v7m0 0L5.2 6.7M8 9.5l2.8-2.8",
					stroke: "currentColor",
					strokeWidth: "1.4",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M2.8 11v1.2c0 .7.6 1.3 1.3 1.3h7.8c.7 0 1.3-.6 1.3-1.3V11",
					stroke: "currentColor",
					strokeWidth: "1.4",
					strokeLinecap: "round"
				})]
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: {
				position: "absolute",
				top: -1,
				right: -2,
				width: 6,
				height: 6,
				borderRadius: "50%",
				background: T$1.brand
			} })]
		}), wide && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			style: {
				flex: 1,
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap"
			},
			children: rowLabel
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			style: {
				color: T$1.text3,
				flex: "none"
			},
			children: "›"
		})] })]
	}), open && status !== void 0 && (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		role: "dialog",
		"aria-modal": "true",
		"aria-label": "DSH 更新",
		onClick: () => {
			if (!installing) setOpen(false);
		},
		style: {
			position: "fixed",
			inset: 0,
			zIndex: 1200,
			background: "rgba(0,0,0,.28)",
			display: "flex",
			alignItems: "center",
			justifyContent: "center"
		},
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			onClick: (e) => {
				e.stopPropagation();
			},
			style: {
				width: "min(560px, calc(100vw - 48px))",
				maxHeight: "calc(100vh - 96px)",
				overflowY: "auto",
				background: T$1.layer,
				border: `1px solid ${T$1.border}`,
				borderRadius: 16,
				boxShadow: "0 24px 64px rgba(0,0,0,.28)",
				padding: 20,
				color: T$1.text,
				fontSize: 13,
				lineHeight: "20px"
			},
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: KEYFRAMES }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						alignItems: "center",
						marginBottom: 16
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
						style: {
							fontSize: 16,
							fontWeight: 600,
							flex: 1
						},
						children: "DSH 更新"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => {
							setOpen(false);
						},
						style: {
							...BTN,
							border: "none",
							padding: "2px 8px",
							fontSize: 18,
							color: T$1.text3
						},
						"aria-label": "关闭",
						children: "×"
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(VersionCompare, { status }),
				available?.subject !== void 0 && available.subject !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						color: T$1.text2,
						marginTop: 12
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: { color: T$1.text3 },
							children: "最新提交　"
						}),
						available.subject,
						available.committedAt !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: { color: T$1.text3 },
							children: ["　·　", new Date(available.committedAt).toLocaleString()]
						})
					]
				}),
				blocked && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						marginTop: 12,
						padding: "10px 12px",
						borderRadius: 8,
						background: T$1.layer2,
						border: `1px solid ${T$1.border}`,
						color: T$1.err
					},
					children: status.dirty ? `harness 工作区有未提交改动，更新已锁住——不替你丢改动。先处理 ${status.repoRoot} 的 git status。` : "本地有远端没有的提交，无法快进更新。"
				}),
				upToDate && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						marginTop: 16,
						color: T$1.text2
					},
					children: busy ? "正在检查更新…" : status.lastCheckedAt !== void 0 ? `已是最新版本　·　上次检查 ${new Date(status.lastCheckedAt).toLocaleString()}` : "已是最新版本"
				}),
				!installing && !needsRestart && !failed && available !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: { marginTop: 16 },
					children: PLAN.map((p) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							gap: 10,
							alignItems: "center",
							padding: "5px 0"
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StepDot, { state: "pending" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
								style: {
									color: T$1.text,
									fontSize: 12,
									flex: "none"
								},
								children: p.cmd
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									color: T$1.text3,
									fontSize: 12,
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap"
								},
								children: p.why
							})
						]
					}, p.cmd))
				}),
				(installing || failed) && status.steps.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: { marginTop: 16 },
					children: [status.steps.map((s) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							gap: 10,
							alignItems: "center",
							padding: "5px 0"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StepDot, { state: s.state }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: { color: s.state === "pending" ? T$1.text3 : T$1.text2 },
							children: s.label
						})]
					}, s.id)), installing && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							color: T$1.text3,
							marginTop: 8
						},
						children: "更新期间请勿退出 DSH（关窗口没关系）。"
					})]
				}),
				failed && status.lastError !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						color: T$1.err,
						marginTop: 12
					},
					children: status.lastError
				}),
				failed && status.steps.find((s) => s.state === "failed")?.tail !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
					style: {
						marginTop: 8,
						maxHeight: 200,
						overflow: "auto",
						background: T$1.layer2,
						border: `1px solid ${T$1.border}`,
						borderRadius: 8,
						padding: 10,
						fontSize: 11,
						lineHeight: "16px",
						color: T$1.text2,
						whiteSpace: "pre-wrap"
					},
					children: status.steps.find((s) => s.state === "failed")?.tail
				}),
				needsRestart && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						marginTop: 16,
						color: T$1.text2
					},
					children: "更新已装好。重启 DSH 服务后生效——服务会自动重新拉起，页面随后刷新。"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						display: "flex",
						gap: 8,
						marginTop: 20,
						justifyContent: "flex-end",
						flexWrap: "wrap"
					},
					children: needsRestart ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						style: BTN_PRIMARY,
						disabled: busy,
						onClick: () => {
							act("restart");
						},
						children: "立即重启"
					}) : installing ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							color: T$1.text3,
							alignSelf: "center"
						},
						children: "更新中…"
					}) : failed ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [status.previousSha !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						style: BTN,
						disabled: busy,
						onClick: () => {
							act("rollback");
						},
						children: ["回滚到 ", status.previousSha.slice(0, 9)]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						style: BTN_PRIMARY,
						disabled: busy,
						onClick: () => {
							act("install");
						},
						children: "重试"
					})] }) : upToDate ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						style: BTN_PRIMARY,
						disabled: busy,
						onClick: () => {
							act("check");
						},
						children: busy ? "检查中…" : "重新检查"
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						style: BTN,
						disabled: busy,
						onClick: dismiss,
						children: "忽略此版本"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						style: {
							...BTN_PRIMARY,
							opacity: blocked ? .5 : 1
						},
						disabled: busy || blocked,
						onClick: () => {
							act("install");
						},
						children: "开始更新"
					})] })
				})
			]
		})
	}), document.body)] });
}

//#endregion
//#region src/client/UpdateSettingsRow.tsx
const T = {
	text: "var(--dsw-alias-label-primary)",
	text3: "var(--dsw-alias-label-tertiary)",
	border: "var(--dsw-alias-border-l2)",
	pill: "var(--dsw-alias-bg-module-platform)",
	brand: "var(--dsw-alias-brand-primary)"
};
function UpdateSettingsRow() {
	const [st, setSt] = (0, react.useState)(void 0);
	const [checking, setChecking] = (0, react.useState)(false);
	(0, react.useEffect)(() => {
		fetchUpdateStatus().then(setSt);
	}, []);
	if (st === void 0) return null;
	const check = async () => {
		setChecking(true);
		try {
			const next = await postUpdate("check") ?? st;
			setSt(next);
			if (next.available !== void 0) openUpdatePanel();
		} finally {
			setChecking(false);
		}
	};
	const hasUpdate = st.available !== void 0;
	const sub = st.available !== void 0 ? `有新版本 ${st.available.version}（落后 ${st.available.behind} 个提交）` : st.lastCheckedAt !== void 0 ? `已是最新　·　上次检查 ${new Date(st.lastCheckedAt).toLocaleString()}` : "已是最新";
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		style: {
			display: "flex",
			alignItems: "center",
			gap: 8,
			padding: "16px 0",
			borderBottom: `1px solid ${T.border}`
		},
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			style: {
				flex: 1,
				minWidth: 0,
				display: "flex",
				flexDirection: "column",
				gap: 4,
				paddingRight: 48
			},
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					fontSize: 14,
					lineHeight: "22px",
					color: T.text
				},
				children: "DSH 版本"
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					fontSize: 13,
					lineHeight: "20px",
					color: st.available !== void 0 ? T.brand : T.text3
				},
				children: [
					st.current.version,
					"　·　",
					sub
				]
			})]
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
			type: "button",
			disabled: checking,
			onClick: () => {
				if (hasUpdate) openUpdatePanel();
				else check();
			},
			style: {
				display: "inline-flex",
				alignItems: "center",
				height: 36,
				padding: "0 14px",
				border: "none",
				borderRadius: 18,
				background: hasUpdate ? T.brand : T.pill,
				color: hasUpdate ? "var(--dsw-alias-label-primary-foreground)" : T.text,
				font: "inherit",
				fontSize: 14,
				lineHeight: "22px",
				cursor: checking ? "default" : "pointer"
			},
			children: checking ? "检查中…" : hasUpdate ? "前往更新" : "检查更新"
		})]
	});
}

//#endregion
//#region src/client/index.tsx
const inject = ["slots"];
function apply(ctx) {
	ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
		name: "sidebar.footer.action",
		id: "self-update",
		order: 40
	}, UpdateAction));
	ctx.slots.inject("settings.general.item", () => ctx.slots.register({
		name: "settings.general.item",
		id: "self-update",
		order: 60
	}, UpdateSettingsRow));
}

//#endregion
exports.apply = apply;
exports.inject = inject;
return module.exports; } });
//# sourceMappingURL=client.js.map