import { iconUrl } from "../lib/path";

type Props = {
	name: string;
	className?: string;
	/** Display size in CSS pixels (also used for width/height attrs). */
	size?: number;
	alt?: string;
};

/** Icon img with explicit dimensions for CLS / Lighthouse unsized-images. */
export function Icon({ name, className, size = 24, alt = "" }: Props) {
	return (
		<img
			className={className}
			src={iconUrl(name)}
			alt={alt}
			width={size}
			height={size}
			draggable={false}
		/>
	);
}
