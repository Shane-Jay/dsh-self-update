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
		const res = await fetch("/self-update/api/update/status", { cache: "no-store" });
		if (!res.ok) return void 0;
		return await res.json();
	} catch {
		return;
	}
}
const POST_INIT = {
	method: "POST",
	headers: { "Content-Type": "application/json" },
	body: "{}"
};
async function postUpdate(action) {
	try {
		const res = await fetch(`/self-update/api/update/${action}`, POST_INIT);
		if (!res.ok) return void 0;
		return await res.json();
	} catch {
		return;
	}
}
/** 请求重启。服务端答应后会在 300ms 内退出，之后用 waitForServer 等它回来。 */
async function postRestart() {
	try {
		const res = await fetch("/self-update/api/update/restart", POST_INIT);
		const body = await res.json().catch(() => ({}));
		return {
			ok: res.ok && body.ok === true,
			mode: body.mode ?? "manual",
			...body.error !== void 0 ? { error: body.error } : {}
		};
	} catch (err) {
		return {
			ok: false,
			mode: "manual",
			error: String(err)
		};
	}
}
/**
* 等新进程接管端口：旧进程还在时 status 会答（pid 不变），退出后 fetch 抛错，
* 新进程起来后 pid 变了——只认 pid 变化，不认"能连上"，免得旧进程还没退就刷新。
*/
async function waitForServer(oldPid, timeoutMs = 12e4) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		await new Promise((r) => setTimeout(r, 1500));
		const st = await fetchUpdateStatus();
		if (st !== void 0 && st.runtime.pid !== oldPid) return true;
	}
	return false;
}

//#endregion
//#region src/client/i18n.ts
function isZh() {
	return (document.documentElement.lang || navigator.language || "").toLowerCase().startsWith("zh");
}
/** 时间只给到分钟：当天只显示时刻，跨天带月日。完整时间戳在这个面板里没人需要。 */
function fmtTime(iso, now = /* @__PURE__ */ new Date()) {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	const p = (n) => String(n).padStart(2, "0");
	const hm = `${p(d.getHours())}:${p(d.getMinutes())}`;
	return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate() ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}
const ZH = {
	rowInstalled: "已装好，待重启",
	rowStale: "需重启",
	rowInstalling: "正在更新…",
	rowFailed: "更新失败",
	rowNew: (v) => `新版本 ${v}`,
	dialogTitle: "DSH 更新",
	close: "关闭",
	current: "当前",
	newVersion: "新版本",
	behind: (n) => `落后 ${n} 个提交`,
	latestCommit: "最新提交",
	dirtyBlocked: (root) => `工作区有未提交改动，已暂停更新。先处理 git status（${root}）。`,
	diverged: "本地有远端没有的提交，无法快进。",
	divergedAhead: (n, ref) => `领先 ${ref} ${n} 个提交：`,
	divergedMore: (n) => `…还有 ${n} 个`,
	realignWhat: (branch, ref) => `对齐会先把当前 HEAD 存为分支 ${branch}，再重置到 ${ref} 并重建。本地提交不会丢。`,
	realignDirty: "有未提交改动，重置会抹掉它们。先处理 git status。",
	realignBtn: "备份并对齐远端",
	backupSaved: (branch) => `本地提交已备份到 ${branch}。`,
	checking: "正在检查…",
	upToDate: "已是最新",
	upToDateAt: (t) => `已是最新 · ${t}`,
	steps: {
		pull: ["拉取源码", "git pull --ff-only"],
		install: ["安装依赖", "pnpm install"],
		clean: ["清理旧产物", "pnpm clean"],
		build: ["重建前端", "pnpm build:official"],
		backup: ["备份本地提交", "git branch"],
		realign: ["对齐远端", "git reset --hard"],
		reset: ["回滚源码", "git reset --hard"]
	},
	dontQuit: "更新期间请勿退出 DSH。",
	installed: "已装好，重启后生效。",
	stale: (running, disk) => `运行中 ${running}，磁盘上已是 ${disk}，重启后生效。`,
	restartBy: {
		"supervisor": "服务会自动拉起。",
		"self-respawn": "未检测到托管进程，服务将自行拉起。",
		"manual": "当前环境无法自动拉起，退出后请手动运行 pnpm dsh web。"
	},
	restartNow: "立即重启",
	restartManual: "退出服务",
	restarting: "正在重启…",
	restartFailed: (e) => `重启失败：${e}`,
	updating: "更新中…",
	rollbackTo: (sha) => `回滚到 ${sha}`,
	retry: "重试",
	recheck: "重新检查",
	checkingBtn: "检查中…",
	dismissBtn: "忽略此版本",
	installBtn: "开始更新",
	aria: {
		running: "执行中",
		ok: "完成",
		failed: "失败",
		skipped: "已跳过",
		pending: "待执行"
	},
	settingsTitle: "DSH 版本",
	settingsNew: (v, n) => `新版本 ${v} · 落后 ${n} 个提交`,
	settingsRestart: "已更新，待重启",
	settingsUpToDateAt: (t) => `已是最新 · ${t}`,
	settingsUpToDate: "已是最新",
	goUpdate: "前往更新",
	goRestart: "重启",
	checkBtn: "检查更新"
};
const EN = {
	rowInstalled: "Installed, restart pending",
	rowStale: "Restart needed",
	rowInstalling: "Updating…",
	rowFailed: "Update failed",
	rowNew: (v) => `New version ${v}`,
	dialogTitle: "DSH Update",
	close: "Close",
	current: "Current",
	newVersion: "New",
	behind: (n) => `${n} commit${n === 1 ? "" : "s"} behind`,
	latestCommit: "Latest commit",
	dirtyBlocked: (root) => `Uncommitted changes in the working tree; update paused. Clean up git status first (${root}).`,
	diverged: "Local commits are not on the remote; cannot fast-forward.",
	divergedAhead: (n, ref) => `${n} commit${n === 1 ? "" : "s"} ahead of ${ref}:`,
	divergedMore: (n) => `…and ${n} more`,
	realignWhat: (branch, ref) => `Aligning saves the current HEAD as branch ${branch}, then resets to ${ref} and rebuilds. No local commit is lost.`,
	realignDirty: "Uncommitted changes would be wiped by the reset. Clean up git status first.",
	realignBtn: "Back up and align to remote",
	backupSaved: (branch) => `Local commits are backed up on ${branch}.`,
	checking: "Checking…",
	upToDate: "Up to date",
	upToDateAt: (t) => `Up to date · ${t}`,
	steps: {
		pull: ["Pull source", "git pull --ff-only"],
		install: ["Install deps", "pnpm install"],
		clean: ["Clean stale output", "pnpm clean"],
		build: ["Rebuild frontend", "pnpm build:official"],
		backup: ["Back up local commits", "git branch"],
		realign: ["Align to remote", "git reset --hard"],
		reset: ["Roll back source", "git reset --hard"]
	},
	dontQuit: "Don't quit DSH while updating.",
	installed: "Installed. Restart to apply.",
	stale: (running, disk) => `Running ${running}, on disk ${disk}. Restart to apply.`,
	restartBy: {
		"supervisor": "The service relaunches itself.",
		"self-respawn": "No supervisor detected; the service will relaunch on its own.",
		"manual": "Nothing can relaunch the service here. After it exits, run pnpm dsh web yourself."
	},
	restartNow: "Restart now",
	restartManual: "Stop service",
	restarting: "Restarting…",
	restartFailed: (e) => `Restart failed: ${e}`,
	updating: "Updating…",
	rollbackTo: (sha) => `Roll back to ${sha}`,
	retry: "Retry",
	recheck: "Check again",
	checkingBtn: "Checking…",
	dismissBtn: "Skip this version",
	installBtn: "Update now",
	aria: {
		running: "Running",
		ok: "Done",
		failed: "Failed",
		skipped: "Skipped",
		pending: "Pending"
	},
	settingsTitle: "DSH version",
	settingsNew: (v, n) => `New version ${v} · ${n} commit${n === 1 ? "" : "s"} behind`,
	settingsRestart: "Updated, restart pending",
	settingsUpToDateAt: (t) => `Up to date · ${t}`,
	settingsUpToDate: "Up to date",
	goUpdate: "Update…",
	goRestart: "Restart",
	checkBtn: "Check for updates"
};
function tr() {
	return isZh() ? ZH : EN;
}
/** 后端 step 只带中文 label；前端按 id 本地化，认不出的 id 用后端 label 当名字、不显示命令。 */
function stepText(id, fallback) {
	return tr().steps[id] ?? [fallback, ""];
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
	const t = tr();
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
		"aria-label": t.aria.running,
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
		"aria-label": t.aria.ok,
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
		"aria-label": t.aria.failed,
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
		"aria-label": state === "skipped" ? t.aria.skipped : t.aria.pending,
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
/** 普通更新会跑的四步（未开工时先摊出来给人看） */
const PLAN_IDS = [
	"pull",
	"install",
	"clean",
	"build"
];
/** 一行步骤：指示圈 + 短名 + 弱化的实际命令。计划态与进行态共用，不会跳版。 */
function StepRow({ id, state, fallback }) {
	const [name, cmd] = stepText(id, fallback ?? id);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		style: {
			display: "flex",
			gap: 10,
			alignItems: "center",
			padding: "5px 0",
			minWidth: 0
		},
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StepDot, { state }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				style: {
					color: state === "pending" ? T$1.text3 : T$1.text2,
					flex: "none"
				},
				children: name
			}),
			cmd !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
				style: {
					color: T$1.text3,
					fontSize: 12,
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap"
				},
				children: cmd
			})
		]
	});
}
/** 版本对照块：当前 → 目标 */
function VersionCompare({ status }) {
	const t = tr();
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
						children: t.current
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
						children: t.newVersion
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
						children: status.available !== void 0 ? t.behind(status.available.behind) : ""
					})
				]
			})
		]
	});
}
/** 备份分支名里的时间戳由后端在执行那一刻生成——界面只能给出形状，不能假装知道具体值。 */
const BACKUP_BRANCH_SHAPE = "local-backup-<yyyyMMdd-HHmmss>";
/**
* 非快进（本地有远端没有的提交）时的出路面板：先把分叉摊开——领先几个提交、都是哪些，
* 再把「备份并对齐远端」会做什么写全，按钮点了就跑（说明已经够，不再叠一层确认弹窗）。
* 工作区脏时按钮禁用：reset --hard 会抹掉未提交改动，备份分支救不回来。
*/
function DivergedPanel({ status, busy, onRealign }) {
	const t = tr();
	const d = status.divergence;
	if (d === void 0) return null;
	const disabled = busy || status.dirty;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		style: {
			marginTop: 12,
			padding: "12px 14px",
			borderRadius: 8,
			background: T$1.layer2,
			border: `1px solid ${T$1.border}`
		},
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: { color: T$1.err },
				children: t.diverged
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					color: T$1.text2,
					marginTop: 8
				},
				children: t.divergedAhead(d.ahead, d.upstreamRef)
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					marginTop: 6,
					maxHeight: 160,
					overflowY: "auto"
				},
				children: [d.commits.map((c) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						gap: 8,
						padding: "2px 0",
						fontSize: 12
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
						style: {
							color: T$1.text3,
							flex: "none"
						},
						children: c.shortSha
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							color: T$1.text2,
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap"
						},
						children: c.subject
					})]
				}, c.shortSha)), d.truncated && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						color: T$1.text3,
						fontSize: 12,
						padding: "2px 0"
					},
					children: t.divergedMore(d.ahead - d.commits.length)
				})]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					color: T$1.text3,
					marginTop: 10
				},
				children: t.realignWhat(BACKUP_BRANCH_SHAPE, d.upstreamRef)
			}),
			status.dirty && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					color: T$1.err,
					marginTop: 8
				},
				children: t.realignDirty
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					display: "flex",
					justifyContent: "flex-end",
					marginTop: 12
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					style: {
						...BTN_PRIMARY,
						opacity: disabled ? .5 : 1
					},
					disabled,
					onClick: onRealign,
					children: t.realignBtn
				})
			})
		]
	});
}
function UpdateAction({ wide }) {
	const [status, setStatus] = (0, react.useState)(void 0);
	const [dismissed, setDismissed] = (0, react.useState)(() => readDismissed());
	const [open, setOpen] = (0, react.useState)(false);
	const [busy, setBusy] = (0, react.useState)(false);
	const [restarting, setRestarting] = (0, react.useState)(false);
	const [restartError, setRestartError] = (0, react.useState)(void 0);
	const timer = (0, react.useRef)(void 0);
	const refresh = (0, react.useCallback)(async () => {
		setStatus(await fetchUpdateStatus());
	}, []);
	(0, react.useEffect)(() => {
		if (restarting) return;
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
		status?.phase,
		restarting
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
		} finally {
			setBusy(false);
		}
	}, []);
	const restart = (0, react.useCallback)(async () => {
		const oldPid = status?.runtime.pid;
		setRestarting(true);
		setRestartError(void 0);
		const r = await postRestart();
		if (!r.ok) {
			setRestartError(r.error ?? r.mode);
			setRestarting(false);
			return;
		}
		if (r.mode === "manual") return;
		if (oldPid === void 0 ? false : await waitForServer(oldPid)) {
			window.location.reload();
			return;
		}
		setRestartError("timeout");
		setRestarting(false);
	}, [status?.runtime.pid]);
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
	const failed = status?.phase === "failed" && status.steps.length > 0;
	const stale = status?.runtime?.stale === true && !installing && !failed;
	const needsRestart = status?.restartRequired === true || stale;
	const blocked = status?.dirty === true || status?.diverged === true;
	const wasRealign = status?.steps.some((s) => s.id === "realign") === true;
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
	const t = tr();
	const rowLabel = needsRestart ? status?.restartRequired === true ? t.rowInstalled : t.rowStale : installing ? t.rowInstalling : failed ? t.rowFailed : t.rowNew(available?.version ?? "");
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
		"aria-label": t.dialogTitle,
		onClick: () => {
			if (!installing && !restarting) setOpen(false);
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
						children: t.dialogTitle
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
						"aria-label": t.close,
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
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: { color: T$1.text3 },
							children: [t.latestCommit, "　"]
						}),
						available.subject,
						available.committedAt !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: { color: T$1.text3 },
							children: ["　·　", fmtTime(available.committedAt)]
						})
					]
				}),
				status.dirty && !installing && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						marginTop: 12,
						padding: "10px 12px",
						borderRadius: 8,
						background: T$1.layer2,
						border: `1px solid ${T$1.border}`,
						color: T$1.err
					},
					children: t.dirtyBlocked(status.repoRoot)
				}),
				status.diverged && !installing && !needsRestart && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DivergedPanel, {
					status,
					busy,
					onRealign: () => {
						act("realign");
					}
				}),
				upToDate && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						marginTop: 16,
						color: T$1.text2
					},
					children: busy ? t.checking : status.lastCheckedAt !== void 0 ? t.upToDateAt(fmtTime(status.lastCheckedAt)) : t.upToDate
				}),
				!installing && !needsRestart && !failed && !status.diverged && available !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: { marginTop: 16 },
					children: PLAN_IDS.map((id) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StepRow, {
						id,
						state: "pending"
					}, id))
				}),
				(installing || failed) && status.steps.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: { marginTop: 16 },
					children: [status.steps.map((s) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StepRow, {
						id: s.id,
						state: s.state,
						fallback: s.label
					}, s.id)), installing && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							color: T$1.text3,
							marginTop: 8
						},
						children: t.dontQuit
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
				needsRestart && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						marginTop: 16,
						color: T$1.text2
					},
					children: [
						status.restartRequired ? t.installed : t.stale(status.runtime.shortSha, status.current.shortSha),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								color: T$1.text3,
								marginTop: 6
							},
							children: t.restartBy[status.runtime?.restartMode ?? "supervisor"]
						}),
						wasRealign && status.backupBranch !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								color: T$1.text3,
								marginTop: 6
							},
							children: t.backupSaved(status.backupBranch)
						}),
						restartError !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								color: T$1.err,
								marginTop: 6
							},
							children: t.restartFailed(restartError)
						})
					]
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
						style: {
							...BTN_PRIMARY,
							opacity: restarting ? .6 : 1
						},
						disabled: busy || restarting,
						onClick: () => {
							restart();
						},
						children: restarting ? t.restarting : status.runtime?.restartMode === "manual" ? t.restartManual : t.restartNow
					}) : installing ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							color: T$1.text3,
							alignSelf: "center"
						},
						children: t.updating
					}) : failed ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [status.previousSha !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						style: BTN,
						disabled: busy,
						onClick: () => {
							act("rollback");
						},
						children: t.rollbackTo(status.previousSha.slice(0, 9))
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						style: BTN_PRIMARY,
						disabled: busy,
						onClick: () => {
							act(wasRealign ? "realign" : "install");
						},
						children: t.retry
					})] }) : upToDate ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						style: BTN_PRIMARY,
						disabled: busy,
						onClick: () => {
							act("check");
						},
						children: busy ? t.checkingBtn : t.recheck
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						style: BTN,
						disabled: busy,
						onClick: dismiss,
						children: t.dismissBtn
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
						children: t.installBtn
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
	const t = tr();
	const needsRestart = st.restartRequired || st.runtime?.stale === true && st.phase !== "installing";
	const hasUpdate = st.available !== void 0;
	const attention = hasUpdate || needsRestart;
	const sub = needsRestart ? t.settingsRestart : st.available !== void 0 ? t.settingsNew(st.available.version, st.available.behind) : st.lastCheckedAt !== void 0 ? t.settingsUpToDateAt(fmtTime(st.lastCheckedAt)) : t.settingsUpToDate;
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
				children: t.settingsTitle
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					fontSize: 13,
					lineHeight: "20px",
					color: attention ? T.brand : T.text3
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
				if (attention) openUpdatePanel();
				else check();
			},
			style: {
				display: "inline-flex",
				alignItems: "center",
				height: 36,
				padding: "0 14px",
				border: "none",
				borderRadius: 18,
				background: attention ? T.brand : T.pill,
				color: attention ? "var(--dsw-alias-label-primary-foreground)" : T.text,
				font: "inherit",
				fontSize: 14,
				lineHeight: "22px",
				cursor: checking ? "default" : "pointer"
			},
			children: checking ? t.checkingBtn : needsRestart ? t.goRestart : hasUpdate ? t.goUpdate : t.checkBtn
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