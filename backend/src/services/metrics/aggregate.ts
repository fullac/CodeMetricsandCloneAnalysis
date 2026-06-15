import type { StaticAnalysisFileMetrics, StaticAnalysisProjectMetrics } from "../../types/index.js";

export function aggregateProjectMetrics(fileMetrics: StaticAnalysisFileMetrics[], cloneRate: number): StaticAnalysisProjectMetrics {
  const functions = fileMetrics.flatMap((file) => file.functions);
  const totalLines = fileMetrics.reduce((sum, file) => sum + file.totalLines, 0);
  const commentLines = fileMetrics.reduce((sum, file) => sum + file.commentLines, 0);
  const complexityTotal = functions.reduce((sum, item) => sum + item.complexity, 0);

  return {
    totalLines,
    ncloc: fileMetrics.reduce((sum, file) => sum + file.ncloc, 0),
    commentDensity: totalLines === 0 ? 0 : commentLines / totalLines,
    functionCount: functions.length,
    classCount: fileMetrics.reduce((sum, file) => sum + file.classCount, 0),
    avgComplexity: functions.length === 0 ? 0 : complexityTotal / functions.length,
    maxComplexity: functions.reduce((max, item) => Math.max(max, item.complexity), 0),
    overComplexFunctions: functions.filter((item) => item.complexity > 15).length,
    overLongFunctions: functions.filter((item) => item.lines > 100).length,
    deeplyNestedFunctions: functions.filter((item) => item.nestingDepth > 4).length,
    cloneRate,
  };
}
