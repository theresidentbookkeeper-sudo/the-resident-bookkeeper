import {useEffect, useState} from 'react';
import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';

// Neutral theme. One accent color comes in through props.
export const T = {
	bg: '#0E0E10',
	text: '#FFFFFF',
	black: '#000000',
	accent: '#FFD60A', // default accent
	claude: '#D97757', // Claude logo only
} as const;

// Unique family names, so a missing file can never silently match a system font.
export const INTER = 'CardInter';
export const ANTON = 'CardAnton';

const FACES = [
	{family: INTER, file: 'Inter.ttf', weight: '100 900'}, // variable font
	{family: ANTON, file: 'Anton-Regular.ttf', weight: '400'},
];

let fontsLoading: Promise<void> | null = null;

const loadFonts = (): Promise<void> => {
	if (!fontsLoading) {
		fontsLoading = Promise.all(
			FACES.map(async ({family, file, weight}) => {
				const face = new FontFace(family, `url('${staticFile(`fonts/${file}`)}') format('truetype')`, {
					weight,
					style: 'normal',
					display: 'block',
				});
				await face.load();
				document.fonts.add(face);
			}),
		).then(() => undefined);
	}
	return fontsLoading;
};

// Holds the render until both local fonts are loaded. Returns true once they are,
// so components can measure text only with the real fonts in place.
export const useCardFonts = (): boolean => {
	const [handle] = useState(() => delayRender('Loading fonts'));
	const [ready, setReady] = useState(false);
	useEffect(() => {
		loadFonts()
			.then(() => setReady(true))
			.catch((err) => cancelRender(err));
	}, []);
	useEffect(() => {
		if (ready) continueRender(handle);
	}, [ready, handle]);
	return ready;
};

let ctx: CanvasRenderingContext2D | null = null;

// Width of one line of text in px, measured with the loaded font.
export const measureText = (text: string, family: string, weight: number, size: number): number => {
	if (!ctx) ctx = document.createElement('canvas').getContext('2d');
	if (!ctx) return 0;
	ctx.font = `${weight} ${size}px "${family}"`;
	return ctx.measureText(text).width;
};

const parseHex = (hex: string): [number, number, number] | null => {
	const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
	if (!m) return null;
	const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
	return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
};

// A valid #rgb or #rrggbb accent, or the default.
export const accentColor = (hex: string | undefined): string => {
	const rgb = hex ? parseHex(hex) : null;
	return rgb ? `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}` : T.accent;
};

// Black or white, whichever has more contrast on the given color (WCAG relative luminance).
export const textOn = (hex: string): string => {
	const rgb = parseHex(hex);
	if (!rgb) return T.black;
	const [r, g, b] = rgb.map((v) => {
		const c = v / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
	return (lum + 0.05) / 0.05 >= 1.05 / (lum + 0.05) ? T.black : T.text;
};
