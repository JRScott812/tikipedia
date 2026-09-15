/** TikTok-style compact stat formatting: numbers ("3.1M") and relative age ("3 weeks ago"). */

/** Compact number: 3100000 -> "3.1M", 12800 -> "12.8K", 342 -> "342". */
export function formatCompactNumber(n: number | null | undefined): string {
	const value = Number(n);
	if (!Number.isFinite(value) || value < 0) return "0";
	if (value < 1000) return String(Math.round(value));
	const units: Array<[number, string]> = [
		[1_000_000_000, "B"],
		[1_000_000, "M"],
		[1_000, "K"]
	];
	for (const [threshold, suffix] of units) {
		if (value >= threshold) {
			const scaled = value / threshold;
			const rounded =
				scaled >= 100 ? Math.round(scaled) : Math.round(scaled * 10) / 10;
			return `${rounded}${suffix}`;
		}
	}
	return String(Math.round(value));
}

const AGE_UNITS: Array<[number, string]> = [
	[60, "second"],
	[60, "minute"],
	[24, "hour"],
	[7, "day"],
	[4.348, "week"],
	[12, "month"],
	[Infinity, "year"]
];

/** Relative age from an ISO timestamp: "3 weeks ago", "1 year ago", "just now". */
export function formatRelativeAge(iso: string | null | undefined): string {
	if (!iso) return "";
	const then = new Date(iso).getTime();
	if (!Number.isFinite(then)) return "";
	let diff = Math.max(0, (Date.now() - then) / 1000);
	if (diff < 30) return "just now";
	let unit = "second";
	for (const [amount, name] of AGE_UNITS) {
		unit = name;
		if (diff < amount) break;
		diff /= amount;
	}
	const n = Math.max(1, Math.round(diff));
	return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}
