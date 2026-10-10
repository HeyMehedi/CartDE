export const MAX_OPTIONS = 3;
export const MAX_VARIANTS = 100;

export interface OptionInput {
	name: string;
	values: string[];
}

/** Derived variant title, e.g. ["M", "Red"] -> "M / Red"; no options -> "Default". */
export function variantTitle(values: readonly string[]): string {
	return values.length === 0 ? "Default" : values.join(" / ");
}

/** Cartesian product of option values, in option order. No options yields one empty combination. */
export function variantCombinations(options: readonly OptionInput[]): string[][] {
	return options.reduce<string[][]>(
		(acc, option) => acc.flatMap((combo) => option.values.map((value) => [...combo, value])),
		[[]],
	);
}

export function validateOptions(options: readonly OptionInput[]): string[] {
	const errors: string[] = [];
	if (options.length > MAX_OPTIONS) errors.push(`At most ${MAX_OPTIONS} options are allowed.`);
	const names = new Set<string>();
	for (const option of options) {
		const key = option.name.trim().toLowerCase();
		if (!key) errors.push("Option names cannot be empty.");
		if (names.has(key)) errors.push(`Duplicate option "${option.name}".`);
		names.add(key);
		if (option.values.length === 0) errors.push(`Option "${option.name}" needs at least one value.`);
		const seen = new Set<string>();
		for (const value of option.values) {
			const v = value.trim().toLowerCase();
			if (!v) errors.push(`Option "${option.name}" has an empty value.`);
			if (seen.has(v)) errors.push(`Option "${option.name}" repeats value "${value}".`);
			seen.add(v);
		}
	}
	if (errors.length === 0 && variantCombinations(options).length > MAX_VARIANTS) {
		errors.push(`These options produce more than ${MAX_VARIANTS} variants.`);
	}
	return errors;
}
