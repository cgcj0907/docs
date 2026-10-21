import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const subjects = [
  { key: "data-structure", name: "数据结构", directory: "data-structure" },
  { key: "computer-architecture", name: "计算机组成原理", directory: "computer-architecture" },
  { key: "linear-algebra", name: "线性代数", directory: "linear-algebra" },
  { key: "higher-mathematics", name: "高等数学", directory: "higher-mathematics" },
  { key: "probability-theory", name: "概率论与数理统计", directory: "probability-theory" }
];

const cleanHeading = (heading) =>
  heading
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\$([^$]+)\$/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_~]/g, "")
    .trim();

const chapterNumber = (filename) => {
  const match = filename.match(/chapter-(\d+)\.mdx$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
};

const graph = {
  generatedFrom: "knowledge-summary MDX files",
  subjects: []
};

let chapterTotal = 0;
let pointTotal = 0;

for (const subject of subjects) {
  const directory = join(subject.directory, "knowledge-summary");
  const files = (await readdir(directory))
    .filter((filename) => /^chapter-\d+\.mdx$/.test(filename))
    .sort((first, second) => chapterNumber(first) - chapterNumber(second));

  const chapters = [];

  for (const filename of files) {
    const path = join(directory, filename);
    const source = await readFile(path, "utf8");
    const titleMatch = source.match(/^title:\s*["']?(.*?)["']?\s*$/m);
    const title = titleMatch ? titleMatch[1].trim() : filename;
    const shortTitle = title.replace(/^第\s*\d+\s*章\s*/, "").trim();
    const points = [...source.matchAll(/^##\s+(.+?)\s*$/gm)]
      .map((match) => cleanHeading(match[1]))
      .filter(Boolean);

    chapters.push({
      title,
      shortTitle,
      number: chapterNumber(filename),
      path: `/${relative(".", path).replace(/\.mdx$/, "")}`,
      points
    });

    chapterTotal += 1;
    pointTotal += points.length;
  }

  graph.subjects.push({
    key: subject.key,
    name: subject.name,
    chapters
  });
}

graph.stats = {
  subjects: graph.subjects.length,
  chapters: chapterTotal,
  points: pointTotal
};

await writeFile(
  "hero-atlas-data.js",
  `/* Auto-generated from knowledge-summary MDX files. Do not edit by hand. */\nwindow.__KB_ATLAS_GRAPH__ = ${JSON.stringify(graph, null, 2)};\n`,
  "utf8"
);

console.log(
  `Generated knowledge graph: ${graph.stats.subjects} subjects, ${graph.stats.chapters} chapters, ${graph.stats.points} knowledge points`
);
