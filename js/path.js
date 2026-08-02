import { state } from "./state.js";

const BASE_PATH = new URL(".", document.baseURI).pathname;
const basePath = (path) => `${BASE_PATH}${path}`;
state.BASE_PATH = BASE_PATH;
state.basePath = basePath;
state.iconUrl = (name) => state.basePath(`icons/${name}.svg`);
state.makeIconImg = function makeIconImg(name, className = "actionIcon") {
	const img = document.createElement("img");
	img.src = state.iconUrl(name);
	img.alt = "";
	img.draggable = false;
	img.className = className;
	img.setAttribute("aria-hidden", "true");
	return img;
};
state.setIconImg = function setIconImg(el, name, className = "actionIcon") {
	if (!el) return null;
	let img = el.querySelector(`img.${className}`);
	if (!img) {
		img = state.makeIconImg(name, className);
		el.prepend(img);
	} else {
		img.src = state.iconUrl(name);
	}
	return img;
};
export { BASE_PATH, basePath };
