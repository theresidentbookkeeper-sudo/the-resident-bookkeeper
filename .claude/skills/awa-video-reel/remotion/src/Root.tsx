import React from 'react';
import {Composition} from 'remotion';
import {DEFAULT_FRAME, metadataFor} from './layout';
import type {IntroCardProps} from './IntroCard';
import {INTRO_SECONDS, IntroCard, introDefaults} from './IntroCard';
import type {EndCardProps} from './EndCard';
import {END_SECONDS, EndCard, endDefaults} from './EndCard';

// Width, height, fps and length are placeholders here. calculateMetadata reads the real ones from the props.
export const RemotionRoot: React.FC = () => (
	<>
		<Composition
			id="IntroCard"
			component={IntroCard}
			defaultProps={introDefaults}
			calculateMetadata={metadataFor<IntroCardProps>(INTRO_SECONDS)}
			{...DEFAULT_FRAME}
			durationInFrames={Math.round(INTRO_SECONDS * DEFAULT_FRAME.fps)}
		/>
		<Composition
			id="EndCard"
			component={EndCard}
			defaultProps={endDefaults}
			calculateMetadata={metadataFor<EndCardProps>(END_SECONDS)}
			{...DEFAULT_FRAME}
			durationInFrames={Math.round(END_SECONDS * DEFAULT_FRAME.fps)}
		/>
	</>
);
