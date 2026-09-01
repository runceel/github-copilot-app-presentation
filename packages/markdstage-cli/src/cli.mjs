// MarkdStage CLI entry point.
//
// Commands are parsed with node:util.parseArgs so the package keeps no runtime
// npm dependencies. Every command shares the runtime modules that the Canvas
// Extension uses, so output is identical in both environments.

import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  EXIT_CODES,
  EXIT_DECK,
  EXIT_FAILURE,
  EXIT_ISSUES,
  EXIT_OK,
  EXIT_USAGE,
  UsageError,
  errorPayload,
  exitCodeFor,
} from "./exit.mjs";
import { parsePageList } from "./deck.mjs";
import { presentCommand } from "./commands/present.mjs";
import { validateCommand, formatValidateReport } from "./commands/validate.mjs";
import { inspectCommand, formatInspectReport } from "./commands/inspect.mjs";
import { captureCommand, formatCaptureReport } from "./commands/capture.mjs";
import { exportCommand, formatExportReport } from "./commands/export.mjs";
import { guideCommand, GUIDE_TOPICS } from "./commands/guide.mjs";
import {
  skillCommand,
  formatSkillReport,
  SKILL_TARGET_NAMES,
} from "./commands/skill.mjs";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const COMMANDS = [
  ["present", "Serve a deck on loopback and open it in a browser window."],
  ["validate", "Check deck structure, Architecture DSL blocks, and themes."],
  ["inspect", "Report 1280x720 clipping diagnostics for a deck."],
  ["capture", "Write 1280x720 PNG files for selected or clipped slides."],
  ["export", "Export the deck as a 16:9 PDF."],
  ["guide", "Print the canonical MarkdStage authoring guide."],
  ["skill", "Install or check the portable MarkdStage Agent Skills."],
  ["help", "Show help for MarkdStage or for one command."],
];

const COMMAND_NAMES = new Set(COMMANDS.map(([name]) => name));

const GLOBAL_OPTIONS = {
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
  json: { type: "boolean" },
  workspace: { type: "string" },
  theme: { type: "string" },
  "theme-file": { type: "string" },
};

const COMMAND_OPTIONS = {
  present: { watch: { type: "boolean" }, "no-open": { type: "boolean" } },
  validate: {},
  inspect: { slide: { type: "string" }, all: { type: "boolean" }, "fail-on-issues": { type: "boolean" } },
  capture: { pages: { type: "string" }, output: { type: "string" } },
  export: { output: { type: "string" } },
  guide: {},
  skill: {
    target: { type: "string" },
    root: { type: "string" },
    force: { type: "boolean" },
  },
};

function usage(command) {
  if (!command) {
    const lines = [
      "MarkdStage — turn Markdown into 16:9 slides.",
      "",
      "Usage: markdstage <command> [options]",
      "",
      "Commands:",
    ];
    for (const [name, description] of COMMANDS) {
      lines.push(`  ${name.padEnd(9)} ${description}`);
    }
    lines.push(
      "",
      "Global options:",
      "  --workspace <dir>   Confine every read and write to this directory.",
      "  --theme <name>      Override the deck theme.",
      "  --theme-file <path> Use a custom theme metadata file.",
      "  --json              Print machine-readable JSON.",
      "  -h, --help          Show help for a command.",
      "  -v, --version       Print the CLI version.",
      "",
      "Run `markdstage help <command>` or `markdstage <command> --help` for command details.",
      "",
      "Exit codes:",
      ...Object.entries(EXIT_CODES).map(([code, meaning]) => `  ${code}  ${meaning}`),
    );
    return lines.join("\n");
  }
  const help = {
    present: [
      "Usage: markdstage present <file.md> [options]",
      "",
      "  --watch     Reload the deck when the Markdown file is saved.",
      "  --no-open   Serve the deck without launching a browser.",
      "",
      "Presenting requires an installed Microsoft Edge, Google Chrome, or Chromium.",
    ],
    validate: [
      "Usage: markdstage validate <file.md> [--json]",
      "",
      "Checks deck structure, Architecture DSL blocks, themes, and theme paths.",
    ],
    inspect: [
      "Usage: markdstage inspect <file.md> [options]",
      "",
      "  --slide <n>        Inspect a single 1-based page.",
      "  --all              Include slides that fit.",
      "  --fail-on-issues   Exit with code 5 when a slide is clipped.",
    ],
    capture: [
      "Usage: markdstage capture <file.md> [options]",
      "",
      "  --pages 2,4        Capture the given 1-based pages (ranges such as 2-5 work too).",
      "  --output <dir>     Write PNG files to this directory.",
      "",
      "Without --pages only the slides reported as clipped are captured.",
    ],
    export: [
      "Usage: markdstage export <file.md> [--output slides.pdf]",
      "",
      "Produces the same 16:9 PDF as the MarkdStage canvas.",
    ],
    guide: [
      "Usage: markdstage guide [topic] [--json]",
      "",
      `Topics: ${GUIDE_TOPICS.join(", ")}.`,
    ],
    skill: [
      "Usage: markdstage skill <install|check> [options]",
      "",
      `  --target <name>  ${SKILL_TARGET_NAMES.join(", ")}, or all (default).`,
      "  --root <dir>     Directory that receives the skill folders (default: cwd).",
      "  --force          Overwrite locally modified generated files.",
      "",
      "Skill contents are generated from the canonical MarkdStage guide topics.",
    ],
    help: [
      "Usage: markdstage help [command]",
      "",
      "Without a command, prints the MarkdStage overview, the global options, and the",
      "exit codes. With a command, prints the same help as `markdstage <command> --help`.",
    ],
  }[command];
  if (!help) throw new UsageError(`Unknown command: ${command}`);
  return help.join("\n");
}

async function packageVersion() {
  const manifest = JSON.parse(
    await readFile(resolve(PACKAGE_ROOT, "package.json"), "utf8"),
  );
  return manifest.version;
}

function requireFile(positionals, command) {
  const file = positionals[0];
  if (!file) {
    throw new UsageError(`${command} requires a Markdown file.\n\n${usage(command)}`);
  }
  return file;
}

function deckOptions(file, values) {
  return {
    file,
    workspace: values.workspace,
    theme: values.theme,
    themeFile: values["theme-file"],
  };
}

export async function run(argv, io = {}) {
  const out = io.out ?? ((text) => console.log(text));
  const err = io.err ?? ((text) => console.error(text));
  const json = (payload) => out(JSON.stringify(payload, null, 2));

  const command = argv[0];
  const rest = argv.slice(1);
  if (command === "--help" || command === "-h" || command === undefined) {
    out(usage());
    return EXIT_OK;
  }
  if (command === "help") {
    const requested = rest.find((argument) => !argument.startsWith("-"));
    // `markdstage help --help` documents the help command itself, like every
    // other `markdstage <command> --help`.
    const topic =
      requested ?? (rest.includes("--help") || rest.includes("-h") ? "help" : undefined);
    if (topic !== undefined && !COMMAND_NAMES.has(topic)) {
      err(`Unknown command: ${topic}\n\n${usage()}`);
      return EXIT_USAGE;
    }
    out(usage(topic));
    return EXIT_OK;
  }
  if (command === "--version" || command === "-v") {
    out(await packageVersion());
    return EXIT_OK;
  }
  if (command.startsWith("-")) {
    err(`Unknown option: ${command}\n\n${usage()}`);
    return EXIT_USAGE;
  }
  if (!COMMAND_OPTIONS[command]) {
    err(`Unknown command: ${command}\n\n${usage()}`);
    return EXIT_USAGE;
  }

  let values;
  let positionals;
  try {
    ({ values, positionals } = parseArgs({
      args: rest,
      options: { ...GLOBAL_OPTIONS, ...COMMAND_OPTIONS[command] },
      allowPositionals: true,
    }));
  } catch (error) {
    err(`${error.message}\n\n${usage(command)}`);
    return EXIT_USAGE;
  }

  if (values.help) {
    out(usage(command));
    return EXIT_OK;
  }
  if (values.version) {
    out(await packageVersion());
    return EXIT_OK;
  }

  try {
    switch (command) {
      case "present": {
        const file = requireFile(positionals, "present");
        const report = await presentCommand(
          { ...deckOptions(file, values), watch: values.watch, open: !values["no-open"], until: io.until },
          {
            print: (message) => out(message),
            status: (message, isError) => (isError ? err(message) : out(message)),
          },
        );
        if (values.json) json(report);
        return EXIT_OK;
      }
      case "validate": {
        const file = requireFile(positionals, "validate");
        const report = await validateCommand(deckOptions(file, values));
        if (values.json) json(report);
        else out(formatValidateReport(report));
        return report.ok ? EXIT_OK : EXIT_DECK;
      }
      case "inspect": {
        const file = requireFile(positionals, "inspect");
        let index;
        if (values.slide !== undefined) {
          const page = Number.parseInt(values.slide, 10);
          if (!Number.isInteger(page) || page < 1) {
            throw new UsageError("--slide expects a 1-based page number.");
          }
          index = page - 1;
        }
        const report = await inspectCommand({
          ...deckOptions(file, values),
          index,
          includeFits: values.all,
        });
        if (values.json) json(report);
        else out(formatInspectReport(report));
        return values["fail-on-issues"] && report.hasIssues ? EXIT_ISSUES : EXIT_OK;
      }
      case "capture": {
        const file = requireFile(positionals, "capture");
        let indexes;
        if (values.pages !== undefined) {
          try {
            indexes = parsePageList(values.pages);
          } catch (error) {
            throw new UsageError(error.message);
          }
        }
        const report = await captureCommand({
          ...deckOptions(file, values),
          indexes,
          output: values.output,
        });
        if (values.json) json(report);
        else out(formatCaptureReport(report));
        return EXIT_OK;
      }
      case "export": {
        const file = requireFile(positionals, "export");
        const report = await exportCommand({
          ...deckOptions(file, values),
          output: values.output,
        });
        if (values.json) json(report);
        else out(formatExportReport(report));
        return EXIT_OK;
      }
      case "guide": {
        const report = await guideCommand({ topic: positionals[0] });
        if (values.json) json(report);
        else out(report.content);
        return EXIT_OK;
      }
      case "skill": {
        const report = await skillCommand({
          action: positionals[0] ?? "install",
          target: values.target,
          root: values.root ? resolve(values.root) : process.cwd(),
          force: values.force,
        });
        if (values.json) json(report);
        else out(formatSkillReport(report));
        if (report.action === "check") {
          return report.changed || report.conflicts ? EXIT_ISSUES : EXIT_OK;
        }
        return report.conflicts ? EXIT_ISSUES : EXIT_OK;
      }
      default:
        err(usage());
        return EXIT_USAGE;
    }
  } catch (error) {
    const code = exitCodeFor(error);
    if (values.json) json(errorPayload(error));
    else err(error?.message || String(error));
    return code || EXIT_FAILURE;
  }
}
