import { state } from "./state.js";

const BASE_PATH = new URL(".", document.baseURI).pathname;
const basePath = (path) => `${BASE_PATH}${path}`;
state.BASE_PATH = BASE_PATH;
state.basePath = basePath;
export { BASE_PATH, basePath };
