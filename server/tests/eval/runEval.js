import { runEvaluationSuite } from './evalRunner.js';

runEvaluationSuite()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Evaluation run failed:', err);
    process.exit(1);
  });
