import Calculator, { CalculatorOptions } from "./index.js";

process.on("message", async (message) => {
  if (process.send === undefined) {
    throw new Error("This script must be called via fork().");
  }

  const { calculatorConfig, calculatorValues } = message as {
    calculatorConfig: CalculatorOptions;
    calculatorValues: Parameters<typeof Calculator.prototype._calculate>[0];
  };

  const matches = await new Calculator(calculatorConfig)._calculate(
    calculatorValues
  );

  process.send({ matches });
});
