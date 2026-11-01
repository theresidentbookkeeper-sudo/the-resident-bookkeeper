import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {ANTON, INTER, T, accentColor, measureText, useCardFonts} from './theme';
import {ClaudeLogo} from './ClaudeLogo';
import type {FrameProps} from './layout';
import {enter, useLayout} from './layout';

export type IntroCardProps = FrameProps & {
	kicker: string;
	word: string;
	claudeLogo: boolean;
	accent: string;
};

export const INTRO_SECONDS = 1.6;

export const introDefaults: IntroCardProps = {
	kicker: '3 ways to edit with',
	word: 'CLAUDE',
	claudeLogo: false,
	accent: T.accent,
};

// Sizes at a 1080px short side.
const WORD = 300; // Anton, uppercase
const KICKER = 64; // Inter 600
const LOGO = 144;

export const IntroCard: React.FC<IntroCardProps> = ({kicker, word, claudeLogo, accent}) => {
	const ready = useCardFonts();
	const frame = useCurrentFrame();
	const {fps, seconds, u, safeW} = useLayout();
	const t = frame / fps;

	// About 0.4 s per element with a short stagger. Squeezed on very short cards,
	// so the entrance always ends well before the last frame, which must be a clean still.
	const k = Math.min(1, (seconds * 0.6) / 0.52);
	const rise = 24 * u;
	const at = (i: number) => enter(t, i * 0.06 * k, 0.4 * k, rise);

	const display = word.toUpperCase();
	let wordSize = WORD * u;
	if (ready) {
		const w = measureText(display, ANTON, 400, 100);
		if (w > 0) wordSize = Math.min(wordSize, ((safeW * 0.98) / w) * 100);
	}

	return (
		<AbsoluteFill style={{background: T.bg}}>
			{ready ? (
				<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
					<div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: safeW}}>
						{claudeLogo ? (
							<div style={{marginBottom: 48 * u, ...at(0)}}>
								<ClaudeLogo size={LOGO * u} />
							</div>
						) : null}
						{kicker ? (
							<div
								style={{
									fontFamily: INTER,
									fontWeight: 600,
									fontSize: KICKER * u,
									lineHeight: 1.2,
									letterSpacing: '-0.01em',
									color: T.text,
									textAlign: 'center',
									textWrap: 'balance',
									...at(claudeLogo ? 1 : 0),
								}}
							>
								{kicker}
							</div>
						) : null}
						<div
							style={{
								fontFamily: ANTON,
								fontWeight: 400,
								fontSize: wordSize,
								lineHeight: 1.1,
								color: accentColor(accent),
								whiteSpace: 'nowrap',
								marginTop: kicker ? 12 * u : 0,
								...at(claudeLogo ? 2 : 1),
							}}
						>
							{display}
						</div>
					</div>
				</AbsoluteFill>
			) : null}
		</AbsoluteFill>
	);
};
