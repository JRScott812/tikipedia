import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AboutPage } from "./AboutPage";

describe("AboutPage", () => {
	it("shows app name and version", () => {
		render(<AboutPage />);
		expect(screen.getByRole("heading", { name: /about/i })).toBeInTheDocument();
		expect(screen.getByText(/Version 3\.0\.0/)).toBeInTheDocument();
		expect(screen.getByText(/Tikipedia/)).toBeInTheDocument();
	});
});
