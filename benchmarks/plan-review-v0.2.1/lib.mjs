const STATUS_KEYS = [
  "mcp_started",
  "tool_responded",
  "schema_valid",
  "reviewer_succeeded",
  "session_complete",
];

export function buildSchedule(orders) {
  return orders.blocks.flatMap((block, blockIndex) => block.map((fixtureId, positionIndex) => ({
    block: blockIndex + 1,
    position: positionIndex + 1,
    fixture_id: fixtureId,
    call_id: `b${blockIndex + 1}-p${positionIndex + 1}-${fixtureId}`,
  })));
}

export function buildToolArguments(plan) {
  return { plan, reviewers: ["codex"], focus: "all", judge: false };
}

export function buildConfig({ model, effort, wrapper }) {
  return [
    "version = 1",
    "",
    "[defaults]",
    'reviewers = ["codex"]',
    'judge = "codex"',
    'focus = "all"',
    "",
    "[reviewers.codex]",
    'type = "cli"',
    'backend = "codex"',
    `binary = ${JSON.stringify(wrapper)}`,
    'args = ["--ignore-user-config", "--ignore-rules"]',
    `model = ${JSON.stringify(model)}`,
    `effort = ${JSON.stringify(effort)}`,
    "timeout_seconds = 300",
    "",
    "[limits]",
    "report_max_chars = 8000",
    "timeout_seconds = 300",
    "",
  ].join("\n");
}

export function assertValidOrders(orders, fixtureIds) {
  if (!Array.isArray(orders?.blocks) || orders.blocks.length !== 3) {
    throw new Error("orders must contain exactly three blocks");
  }
  const expected = [...fixtureIds].sort();
  for (const [index, block] of orders.blocks.entries()) {
    if (!Array.isArray(block) || block.length !== expected.length) {
      throw new Error(`block ${index + 1} must contain ${expected.length} fixtures`);
    }
    const actual = [...block].sort();
    if (new Set(block).size !== block.length || actual.some((id, i) => id !== expected[i])) {
      throw new Error(`block ${index + 1} is not a permutation of the fixture set`);
    }
  }
}

export function normalizeForPublication(value, replacements) {
  const ordered = [...replacements].sort((a, b) => b[0].length - a[0].length);
  if (typeof value === "string") {
    return ordered.reduce((text, [source, target]) => text.split(source).join(target), value);
  }
  if (Array.isArray(value)) return value.map((item) => normalizeForPublication(item, ordered));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeForPublication(item, ordered)]));
  }
  return value;
}

export function scoreRecords(records, oracle) {
  const fixtures = oracle?.fixtures ?? {};
  const fixtureIds = Object.keys(fixtures);
  const semantic = records.filter((record) => record.status?.schema_valid && record.result?.verdict);
  const legacyHits = semantic.filter((record) => record.result.verdict === fixtures[record.fixture_id]?.legacy_verdict).length;
  const acceptableHits = semantic.filter((record) => fixtures[record.fixture_id]?.acceptable_verdicts?.includes(record.result.verdict)).length;

  let categoryHits = 0;
  let categoryTotal = 0;
  const macroRatios = [];
  let majorityHits = 0;
  let majorityTotal = 0;
  const perFixture = {};

  for (const fixtureId of fixtureIds) {
    const expected = fixtures[fixtureId].expected_categories ?? [];
    const attempts = records.filter((record) => record.fixture_id === fixtureId);
    const outputs = semantic.filter((record) => record.fixture_id === fixtureId);
    let fixtureHits = 0;
    let fixtureTotal = 0;
    for (const record of outputs) {
      const found = new Set((record.result.findings ?? []).map((finding) => finding.category));
      for (const category of expected) {
        fixtureTotal += 1;
        if (found.has(category)) fixtureHits += 1;
      }
    }
    categoryHits += fixtureHits;
    categoryTotal += fixtureTotal;
    if (fixtureTotal > 0) macroRatios.push(fixtureHits / fixtureTotal);

    if (outputs.length === 3) {
      for (const category of expected) {
        majorityTotal += 1;
        const detections = outputs.filter((record) => new Set((record.result.findings ?? []).map((finding) => finding.category)).has(category)).length;
        if (detections >= 2) majorityHits += 1;
      }
    }

    perFixture[fixtureId] = {
      attempts: attempts.length,
      semantic_calls: outputs.length,
      verdicts: outputs.map((record) => record.result.verdict),
      legacy_agreements: outputs.filter((record) => record.result.verdict === fixtures[fixtureId].legacy_verdict).length,
      acceptable_agreements: outputs.filter((record) => fixtures[fixtureId].acceptable_verdicts.includes(record.result.verdict)).length,
      category_recall: ratio(fixtureHits, fixtureTotal),
    };
  }

  const operations = Object.fromEntries(STATUS_KEYS.map((key) => [key, records.filter((record) => record.status?.[key]).length]));
  const successes = records.filter((record) => STATUS_KEYS.every((key) => record.status?.[key]));
  const successDurations = successes.map((record) => record.duration_ms).filter(Number.isFinite).sort((a, b) => a - b);
  const failureDurations = records.filter((record) => !successes.includes(record)).map((record) => record.duration_ms).filter(Number.isFinite).sort((a, b) => a - b);
  const correct = semantic.filter((record) => record.fixture_id === "trivial-correct");

  return {
    attempts: records.length,
    completed_blocks: countCompletedBlocks(records, fixtureIds),
    semantic_calls: semantic.length,
    verdict_agreement: {
      legacy: ratio(legacyHits, semantic.length),
      acceptable: ratio(acceptableHits, semantic.length),
    },
    category_recall: {
      micro: ratio(categoryHits, categoryTotal),
      macro_ratio: macroRatios.length ? mean(macroRatios) : null,
      majority: ratio(majorityHits, majorityTotal),
    },
    correct_fixture: {
      attempts: correct.length,
      non_approvals: correct.filter((record) => record.result.verdict !== "approve").length,
      minor_findings_on_approvals: correct
        .filter((record) => record.result.verdict === "approve")
        .flatMap((record) => record.result.findings ?? [])
        .filter((finding) => finding.severity === "minor").length,
    },
    operations: { ...operations, full_success: successes.length },
    latency: {
      success_count: successDurations.length,
      sorted_ms: successDurations,
      median_ms: median(successDurations),
      p95_ms: nearestRank(successDurations, 0.95),
      failure_ms: failureDurations,
    },
    per_fixture: perFixture,
    always_approve_baseline: {
      legacy_verdict_agreement: ratio(fixtureIds.filter((id) => fixtures[id].legacy_verdict === "approve").length, fixtureIds.length),
      expected_category_recall: 0,
      latency: null,
      operational_success: null,
    },
  };
}

export function nearestRank(sortedValues, percentile) {
  if (sortedValues.length === 0) return null;
  return sortedValues[Math.ceil(percentile * sortedValues.length) - 1];
}

function countCompletedBlocks(records, fixtureIds) {
  const byBlock = new Map();
  for (const record of records) {
    if (!byBlock.has(record.block)) byBlock.set(record.block, []);
    byBlock.get(record.block).push(record.fixture_id);
  }
  const expected = [...fixtureIds].sort().join("\0");
  return [...byBlock.values()].filter((ids) => ids.length === fixtureIds.length && new Set(ids).size === ids.length && [...ids].sort().join("\0") === expected).length;
}

function ratio(hits, total) {
  return { hits, total, ratio: total ? hits / total : null };
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  if (!values.length) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}
