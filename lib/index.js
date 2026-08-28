import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";

//#region src/updater.ts
/** 退出码约定：桌面壳（scripts/macapp）看到 75 就自动重新拉起服务。 */
const RESTART_EXIT_CODE = 75;
const TAIL_LIMIT = 4e3;
function tailOf(text) {
	const trimmed = text.trimEnd();
	return trimmed.length > TAIL_LIMIT ? `…${trimmed.slice(-TAIL_LIMIT)}` : trimmed;
}
/** execFile 的 Promise 版：不走 shell，参数逐个传，输出合并成尾巴。 */
function run(cmd, args, opts) {
	return new Promise((resolve) => {
		execFile(cmd, args, {
			cwd: opts.cwd,
			timeout: opts.timeoutMs ?? 12e4,
			maxBuffer: 32 * 1024 * 1024,
			env: opts.env ?? process.env
		}, (err, stdout, stderr) => {
			const out = `${stdout ?? ""}${stderr ?? ""}`;
			resolve({
				ok: err === null,
				out
			});
		});
	});
}
function versionOf(json) {
	try {
		const v = JSON.parse(json).version;
		return typeof v === "string" ? v : "unknown";
	} catch {
		return "unknown";
	}
}
var Updater = class {
	repoRoot;
	remote;
	stateFile;
	checkIntervalMs;
	installCmd;
	buildCmd;
	branch;
	timer;
	busy = false;
	state = {
		phase: "idle",
		steps: [],
		restartRequired: false
	};
	constructor(opts) {
		this.opts = opts;
		this.repoRoot = opts.repoRoot;
		this.remote = opts.remote ?? "origin";
		this.branch = opts.branch ?? "master";
		this.checkIntervalMs = opts.checkIntervalMs ?? 360 * 60 * 1e3;
		this.installCmd = opts.commands?.install ?? [
			"pnpm",
			"install",
			"--frozen-lockfile"
		];
		this.buildCmd = opts.commands?.build ?? ["pnpm", "build:official"];
		this.stateFile = opts.stateFile;
		this.restore();
	}
	restore() {
		if (this.stateFile === void 0 || !existsSync(this.stateFile)) return;
		try {
			const saved = JSON.parse(readFileSync(this.stateFile, "utf8"));
			this.state = {
				phase: saved.restartRequired === true ? "ready-to-restart" : "idle",
				steps: saved.restartRequired === true ? saved.steps ?? [] : [],
				restartRequired: saved.restartRequired ?? false,
				...saved.lastCheckedAt !== void 0 ? { lastCheckedAt: saved.lastCheckedAt } : {},
				...saved.available !== void 0 ? { available: saved.available } : {},
				...saved.previousSha !== void 0 ? { previousSha: saved.previousSha } : {}
			};
		} catch {}
	}
	persist() {
		if (this.stateFile === void 0) return;
		try {
			mkdirSync(dirname(this.stateFile), { recursive: true });
			writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
		} catch {}
	}
	/** 启动定期检查（立即检查一次，随后按间隔）。返回停止函数。 */
	start() {
		if (this.checkIntervalMs <= 0) return () => {};
		this.check();
		this.timer = setInterval(() => {
			this.check();
		}, this.checkIntervalMs);
		this.timer.unref?.();
		return () => {
			if (this.timer !== void 0) clearInterval(this.timer);
		};
	}
	async gitOut(args) {
		const r = await run("git", args, { cwd: this.repoRoot });
		return r.ok ? r.out.trim() : "";
	}
	async currentRev() {
		const sha = await this.gitOut(["rev-parse", "HEAD"]);
		let version = "unknown";
		try {
			version = versionOf(readFileSync(join(this.repoRoot, "package.json"), "utf8"));
		} catch {}
		return {
			sha,
			shortSha: sha.slice(0, 9),
			version,
			subject: await this.gitOut([
				"log",
				"-1",
				"--format=%s"
			]),
			committedAt: await this.gitOut([
				"log",
				"-1",
				"--format=%cI"
			])
		};
	}
	/** 探测本地跟踪的上游分支（拿不到就沿用默认）。 */
	async resolveBranch() {
		const upstream = await this.gitOut([
			"rev-parse",
			"--abbrev-ref",
			"--symbolic-full-name",
			"@{upstream}"
		]);
		const m = /^([^/]+)\/(.+)$/.exec(upstream);
		if (m?.[2] !== void 0) this.branch = m[2];
	}
	async status() {
		const current = await this.currentRev();
		const dirty = await this.gitOut(["status", "--porcelain"]) !== "";
		const ahead = await this.gitOut([
			"rev-list",
			"--count",
			`${this.remote}/${this.branch}..HEAD`
		]);
		return {
			phase: this.state.phase,
			repoRoot: this.repoRoot,
			branch: this.branch,
			current,
			...this.state.available !== void 0 ? { available: this.state.available } : {},
			...this.state.lastCheckedAt !== void 0 ? { lastCheckedAt: this.state.lastCheckedAt } : {},
			...this.state.lastError !== void 0 ? { lastError: this.state.lastError } : {},
			dirty,
			diverged: ahead !== "" && ahead !== "0",
			steps: this.state.steps,
			restartRequired: this.state.restartRequired,
			...this.state.previousSha !== void 0 ? { previousSha: this.state.previousSha } : {}
		};
	}
	/** git fetch + 比对。安装期间跳过（不打断步骤状态）。 */
	async check() {
		if (this.busy) return this.status();
		const prevPhase = this.state.phase;
		this.state.phase = prevPhase === "ready-to-restart" ? prevPhase : "checking";
		try {
			await this.resolveBranch();
			const fetched = await run("git", [
				"fetch",
				"--quiet",
				this.remote,
				this.branch
			], {
				cwd: this.repoRoot,
				timeoutMs: 18e4
			});
			if (!fetched.ok) throw new Error(`git fetch 失败：${tailOf(fetched.out) || "未知错误"}`);
			const behindRaw = await this.gitOut([
				"rev-list",
				"--count",
				`HEAD..${this.remote}/${this.branch}`
			]);
			const behind = Number(behindRaw || "0");
			this.state.lastCheckedAt = (/* @__PURE__ */ new Date()).toISOString();
			delete this.state.lastError;
			if (!Number.isFinite(behind) || behind <= 0) delete this.state.available;
			else {
				const sha = await this.gitOut(["rev-parse", `${this.remote}/${this.branch}`]);
				const pkg = await this.gitOut(["show", `${this.remote}/${this.branch}:package.json`]);
				this.state.available = {
					sha,
					shortSha: sha.slice(0, 9),
					version: versionOf(pkg),
					subject: await this.gitOut([
						"log",
						"-1",
						"--format=%s",
						`${this.remote}/${this.branch}`
					]),
					committedAt: await this.gitOut([
						"log",
						"-1",
						"--format=%cI",
						`${this.remote}/${this.branch}`
					]),
					behind
				};
			}
		} catch (err) {
			this.state.lastError = err instanceof Error ? err.message : String(err);
			this.state.phase = "failed";
			this.persist();
			return this.status();
		}
		if (this.state.phase === "checking") this.state.phase = "idle";
		this.persist();
		return this.status();
	}
	/**
	* 只用本地 ref 重算"还落后多少"（不联网）。安装/回滚跑完必须重算：
	* pull 成功后 HEAD 已经动了，留着旧的 available 会在界面上写着
	* "当前 rc.8 · 落后 1 个提交"这种自相矛盾的话。
	*/
	async recount() {
		const behind = Number(await this.gitOut([
			"rev-list",
			"--count",
			`HEAD..${this.remote}/${this.branch}`
		]) || "0");
		if (!Number.isFinite(behind) || behind <= 0) {
			delete this.state.available;
			return;
		}
		if (this.state.available !== void 0) this.state.available.behind = behind;
	}
	setStep(id, patch) {
		const step = this.state.steps.find((s) => s.id === id);
		if (step !== void 0) Object.assign(step, patch);
		this.persist();
	}
	/**
	* 拉取并重建。单飞：安装期间再次调用直接返回当前状态。
	* 任一步失败即停在该步，前面已完成的步骤不回退（git pull 成功但 build 失败时，
	* 用户可以选择重试或回滚）。
	*/
	async install() {
		if (this.busy) return this.status();
		this.busy = true;
		this.state.phase = "installing";
		delete this.state.lastError;
		this.state.restartRequired = false;
		this.state.steps = [
			{
				id: "pull",
				label: "拉取源码 (git pull --ff-only)",
				state: "pending"
			},
			{
				id: "install",
				label: "安装依赖 (pnpm install)",
				state: "pending"
			},
			{
				id: "build",
				label: "重建前端 (pnpm build:official)",
				state: "pending"
			}
		];
		this.persist();
		const fail = async (msg) => {
			this.busy = false;
			this.state.lastError = msg;
			this.state.phase = "failed";
			this.state.steps = [];
			this.persist();
			return this.status();
		};
		const pre = await this.status();
		if (pre.dirty) return await fail("工作区有未提交改动，拒绝更新（先自行处理 git status）");
		if (pre.diverged) return await fail("本地有远端没有的提交，无法快进更新");
		if (pre.available === void 0) return await fail("没有可用更新");
		this.state.previousSha = pre.current.sha;
		this.persist();
		const steps = [
			{
				id: "pull",
				cmd: "git",
				args: [
					"pull",
					"--ff-only",
					this.remote,
					this.branch
				],
				timeoutMs: 3e5
			},
			{
				id: "install",
				cmd: this.installCmd[0],
				args: this.installCmd.slice(1),
				timeoutMs: 9e5
			},
			{
				id: "build",
				cmd: this.buildCmd[0],
				args: this.buildCmd.slice(1),
				timeoutMs: 18e5
			}
		];
		try {
			for (const step of steps) {
				this.setStep(step.id, {
					state: "running",
					startedAt: (/* @__PURE__ */ new Date()).toISOString()
				});
				const r = await run(step.cmd, step.args, {
					cwd: this.repoRoot,
					timeoutMs: step.timeoutMs,
					env: {
						...process.env,
						CI: "1"
					}
				});
				this.setStep(step.id, {
					state: r.ok ? "ok" : "failed",
					tail: tailOf(r.out),
					endedAt: (/* @__PURE__ */ new Date()).toISOString()
				});
				if (!r.ok) {
					for (const rest of this.state.steps) if (rest.state === "pending") rest.state = "skipped";
					this.state.phase = "failed";
					this.state.lastError = `${this.state.steps.find((x) => x.id === step.id)?.label ?? step.id} 失败`;
					await this.recount();
					this.persist();
					return this.status();
				}
			}
			this.state.phase = "ready-to-restart";
			this.state.restartRequired = true;
			delete this.state.available;
			this.persist();
			return this.status();
		} finally {
			this.busy = false;
		}
	}
	/** 回滚到安装前的提交（同样要 install + build 才是一致状态）。 */
	async rollback() {
		const target = this.state.previousSha;
		if (this.busy || target === void 0) return this.status();
		this.busy = true;
		this.state.phase = "installing";
		this.state.steps = [
			{
				id: "reset",
				label: `回滚源码 (git reset --hard ${target.slice(0, 9)})`,
				state: "pending"
			},
			{
				id: "install",
				label: "安装依赖 (pnpm install)",
				state: "pending"
			},
			{
				id: "build",
				label: "重建前端 (pnpm build:official)",
				state: "pending"
			}
		];
		this.persist();
		const steps = [
			{
				id: "reset",
				cmd: "git",
				args: [
					"reset",
					"--hard",
					target
				],
				timeoutMs: 12e4
			},
			{
				id: "install",
				cmd: this.installCmd[0],
				args: this.installCmd.slice(1),
				timeoutMs: 9e5
			},
			{
				id: "build",
				cmd: this.buildCmd[0],
				args: this.buildCmd.slice(1),
				timeoutMs: 18e5
			}
		];
		try {
			for (const step of steps) {
				this.setStep(step.id, {
					state: "running",
					startedAt: (/* @__PURE__ */ new Date()).toISOString()
				});
				const r = await run(step.cmd, step.args, {
					cwd: this.repoRoot,
					timeoutMs: step.timeoutMs
				});
				this.setStep(step.id, {
					state: r.ok ? "ok" : "failed",
					tail: tailOf(r.out),
					endedAt: (/* @__PURE__ */ new Date()).toISOString()
				});
				if (!r.ok) {
					this.state.phase = "failed";
					this.state.lastError = `${this.state.steps.find((x) => x.id === step.id)?.label ?? step.id} 失败`;
					await this.recount();
					this.persist();
					return this.status();
				}
			}
			this.state.phase = "ready-to-restart";
			this.state.restartRequired = true;
			await this.recount();
			this.persist();
			return this.status();
		} finally {
			this.busy = false;
		}
	}
	/** 清掉"待重启"标记（重启后由新进程调用）。 */
	clearRestartFlag() {
		this.state.restartRequired = false;
		if (this.state.phase === "ready-to-restart") this.state.phase = "idle";
		this.persist();
	}
};

//#endregion
//#region src/index.ts
const name = "self-update";
const inject = [];
function apply(ctx, config = {}) {
	const harnessRoot = config.repoRoot ?? process.cwd();
	const updater = existsSync(join(harnessRoot, ".git")) ? (() => {
		const dataDir = config.dataDir ?? join(homedir(), ".dsh-self-update");
		mkdirSync(dataDir, { recursive: true });
		return new Updater({
			repoRoot: harnessRoot,
			stateFile: join(dataDir, "update-state.json"),
			checkIntervalMs: config.disabled === true ? 0 : config.checkIntervalMs ?? 360 * 60 * 1e3
		});
	})() : void 0;
	if (updater !== void 0) {
		updater.clearRestartFlag();
		ctx.effect(() => updater.start());
	}
	const isLocalOrigin = (origin) => {
		try {
			const u = new URL(origin);
			return u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "::1" || u.hostname === "[::1]";
		} catch {
			return false;
		}
	};
	ctx.inject(["webServer"], (webCtx) => {
		webCtx.effect(() => webCtx.webServer.register({
			kind: "prefix",
			path: "/self-update/api",
			handler: async (req, res) => {
				try {
					const url = new URL(req.url ?? "/", "http://localhost");
					res.setHeader("Content-Type", "application/json; charset=utf-8");
					const method = req.method ?? "GET";
					if (method !== "GET") {
						if (!String(req.headers?.["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
							res.statusCode = 415;
							res.end(JSON.stringify({ error: "写操作要求 content-type: application/json" }));
							return;
						}
						const origin = req.headers?.["origin"];
						if (typeof origin === "string" && origin !== "" && !isLocalOrigin(origin)) {
							res.statusCode = 403;
							res.end(JSON.stringify({ error: "非本机 Origin，拒绝写操作" }));
							return;
						}
					}
					if (updater === void 0) {
						res.statusCode = 404;
						res.end(JSON.stringify({ error: "dsh 不是 git 工作副本，自更新不可用" }));
						return;
					}
					if (url.pathname.endsWith("/update/status") && method === "GET") {
						res.end(JSON.stringify(await updater.status()));
						return;
					}
					if (url.pathname.endsWith("/update/check") && method === "POST") {
						res.end(JSON.stringify(await updater.check()));
						return;
					}
					if (url.pathname.endsWith("/update/install") && method === "POST") {
						updater.install().catch(() => {});
						res.end(JSON.stringify(await updater.status()));
						return;
					}
					if (url.pathname.endsWith("/update/rollback") && method === "POST") {
						updater.rollback().catch(() => {});
						res.end(JSON.stringify(await updater.status()));
						return;
					}
					if (url.pathname.endsWith("/update/restart") && method === "POST") {
						res.end(JSON.stringify({
							ok: true,
							exitCode: RESTART_EXIT_CODE
						}));
						setTimeout(() => process.exit(RESTART_EXIT_CODE), 300).unref?.();
						return;
					}
					res.statusCode = 404;
					res.end(JSON.stringify({ error: "not found" }));
				} catch (err) {
					res.statusCode = 500;
					res.end(JSON.stringify({ error: String(err) }));
				}
			}
		}));
	});
}

//#endregion
export { apply, inject, name };