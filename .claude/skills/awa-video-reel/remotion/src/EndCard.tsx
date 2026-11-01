import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {INTER, T, accentColor, measureText, textOn, useCardFonts} from './theme';
import type {FrameProps} from './layout';
import {enter, useLayout} from './layout';

export type EndCardProps = FrameProps & {
	line1: string;
	handle: string;
	sub: string;
	accent: string;
};

export const END_SECONDS = 2.5;

export const endDefaults: EndCardProps = {
	line1: 'Follow for more',
	handle: '@yourname',
	sub: '',
	accent: T.accent,
};

// Sizes at a 1080px short side.
const LINE1 = 112; // Inter 900
const HANDLE = 64; // Inter 700 in the accent pill
const SUB = 40; // Inter 500
const PAD_X = 48;
const PAD_Y = 18;
const BLOCK = 972; // the 90% safe box of a square

// Shrinks a size until the widest of the given strings fits.
const fit = (texts: string[], weight: number, size: number, max: number) => {
	const widest = Math.max(0, ...texts.map((s) => measureText(s, INTER, weight, size)));
	return widest > max ? (size * max) / widest : size;
};

export const EndCard: React.FC<EndCardProps> = ({line1, handle, sub, accent}) => {
	const ready = useCardFonts();
	const frame = useCurrentFrame();
	const {fps, seconds, u, safeW} = useLayout();
	const t = frame / fps;

	// Line, pill, sub arrive one after another and settle by about 0.8 s.
	const k = Math.min(1, (seconds * 0.6) / 0.77);
	const rise = 24 * u;
	const at = (start: number) => enter(t, start * k, 0.45 * k, rise);

	const block = Math.min(safeW, BLOCK * u);
	const fill = accentColor(accent);
	const showHandle = handle.trim().length > 0;

	// line1 may wrap onto two balanced lines, but no single word may overflow.
	let line1Size = LINE1 * u;
	let handleSize = HANDLE * u;
	let subSize = SUB * u;
	if (ready) {
		line1Size = fit(line1.split(/\s+/), 900, line1Size, block);
		handleSize = fit([handle.trim()], 700, handleSize, block - 2 * PAD_X * u);
		subSize = fit(sub.split(/\s+/), 500, subSize, block);
	}

	return (
		<AbsoluteFill style={{background: T.bg}}>
			{ready ? (
				<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
					<div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: block, fontFamily: INTER}}>
						<div
							style={{
								fontWeight: 900,
								fontSize: line1Size,
								lineHeight: 1.05,
								letterSpacing: '-0.01em',
								color: T.text,
								textAlign: 'center',
								textWrap: 'balance',
								...at(0),
							}}
						>
							{line1}
						</div>
						{showHandle ? (
							<div
								style={{
									marginTop: 56 * u,
									padding: `${PAD_Y * u}px ${PAD_X * u}px`,
									borderRadius: 9999,
									background: fill,
									color: textOn(fill),
									fontWeight: 700,
									fontSize: handleSize,
									lineHeight: 1.2,
									whiteSpace: 'nowrap',
									...at(0.18),
								}}
							>
								{handle.trim()}
							</div>
						) : null}
						{showHandle && sub ? (
							<div
								style={{
									marginTop: 32 * u,
									fontWeight: 500,
									fontSize: subSize,
									lineHeight: 1.3,
									color: T.text,
									textAlign: 'center',
									textWrap: 'balance',
									...at(0.32),
								}}
							>
								{sub}
							</div>
						) : null}
					</div>
				</AbsoluteFill>
			) : null}
		</AbsoluteFill>
	);
};
