import { describe, expect, it } from "vitest";
import { APP_VERSION, PREFETCH_AHEAD, RELATED_LINK_CAP } from "./config";

describe("config constants", () => {
	it("exposes package version 3.0.0", () => {
		expect(APP_VERSION).toBe("3.0.0");
	});

	it("keeps feed prefetch defaults", () => {
		expect(PREFETCH_AHEAD).toBe(3);
		expect(RELATED_LINK_CAP).toBe(8);
	});
});
