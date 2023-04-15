import {Calculation} from "pluralistic";

export interface CalculatorOptions {
    baseDataPath: string;
    chainId: string;
    roundId: string;
    matchAmount: number;
    minimumAmount?: number;
    passportThreshold?: number;
    passport?: boolean;
}

export type AugmentedResult = Calculation & {
    projectName: string;
    payoutAddress: string;
};

export interface RawContribution {
    voter: string;
    projectId: string;
    amountUSD: number;
}
