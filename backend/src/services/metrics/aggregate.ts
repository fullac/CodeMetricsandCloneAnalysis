import type { StaticAnalysisFileMetrics, StaticAnalysisProjectMetrics, StaticAnalysisScoreMetric, StaticAnalysisScoreMetricRule } from "../../types/index.js";

export function aggregateProjectMetrics(
  fileMetrics: StaticAnalysisFileMetrics[],
  cloneRate: number,
  metricThresholds: Partial<Record<StaticAnalysisScoreMetric, StaticAnalysisScoreMetricRule>> = {},
): StaticAnalysisProjectMetrics {
  const functions = fileMetrics.flatMap((file) => file.functions);
  const totalLines = fileMetrics.reduce((sum, file) => sum + file.totalLines, 0);
  const commentLines = fileMetrics.reduce((sum, file) => sum + file.commentLines, 0);
  const complexityTotal = functions.reduce((sum, item) => sum + item.complexity, 0);
  const countAbove = (metric: StaticAnalysisScoreMetric, values: number[]) => {
    const threshold = metricThresholds[metric]?.threshold;
    return threshold === undefined ? 0 : values.filter((value) => value > threshold).length;
  };

  return {
    totalLines,
    ncloc: fileMetrics.reduce((sum, file) => sum + file.ncloc, 0),
    commentDensity: totalLines === 0 ? 0 : commentLines / totalLines,
    functionCount: functions.length,
    classCount: fileMetrics.reduce((sum, file) => sum + file.classCount, 0),
    avgComplexity: functions.length === 0 ? 0 : complexityTotal / functions.length,
    maxComplexity: functions.reduce((max, item) => Math.max(max, item.complexity), 0),
    overComplexFunctions: countAbove("maxComplexity", functions.map((item) => item.complexity)),
    overLongFunctions: countAbove("maxFunctionLines", functions.map((item) => item.lines)),
    deeplyNestedFunctions: countAbove("maxNestingDepth", functions.map((item) => item.nestingDepth)),
    cloneRate,
  };
}
