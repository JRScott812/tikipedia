import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { BottomNav } from "./BottomNav";

vi.mock("../hooks/usePwaInstall", () => ({
	usePwaInstall: () => ({ visible: false, install: vi.fn() })
}));

describe("BottomNav", () => {
	it("renders primary nav links", () => {
		render(
			<MemoryRouter>
				<BottomNav />
			</MemoryRouter>
		);
		expect(screen.getByRole("button", { name: /home/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /profiles/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /stats/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /settings/i })).toBeInTheDocument();
	});
});
