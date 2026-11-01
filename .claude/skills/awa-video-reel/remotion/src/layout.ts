import type {CalculateMetadataFunction} from 'remotion';
import {Easing, interpolate, useVideoConfig} from 'remotion';

// Size, fps and length come from the input props, so one template renders every format.
export type FrameProps = {
	width?: number;
	height?: number;
	fps?: number;
	durationInFrames?: number; // wins over seconds
	seconds?: number;
};

export const DEFAULT_FRAME = {width: 1080, height: 1920, fps: 30};

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2); // H.264 yuv420p needs even sizes

export const metadataFor =
	<P extends FrameProps>(defaultSeconds: number): CalculateMetadataFunction<P> =>
	({props}) => {
		const fps = props.fps ?? DEFAULT_FRAME.fps;
		const seconds = props.seconds ?? defaultSeconds;
		return {
			width: even(props.width ?? DEFAULT_FRAME.width),
			height: even(props.height ?? DEFAULT_FRAME.height),
			fps,
			durationInFrames: Math.max(1, Math.round(props.durationInFrames ?? seconds * fps)),
		};
	};

// Everything is designed on a 1080px short side and scaled by u.
// The content is designed to fit 972 x 972 at u = 1, which is the 90% safe box of a square,
// so it also fits the safe box of every taller or wider frame.
export const useLayout = () => {
	const {width, height, fps, durationInFrames} = useVideoConfig();
	const u = Math.min(width, height) / 1080;
	return {
		width,
		height,
		fps,
		seconds: durationInFrames / fps,
		u,
		safeW: width * 0.9,
		safeH: height * 0.9,
	};
};

// Fade and small rise for one element. Ends exactly at opacity 1 and no offset.
export const enter = (t: number, start: number, length: number, rise: number) => {
	const p = interpolate(t, [start, start + length], [0, 1], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
		easing: Easing.out(Easing.cubic),
	});
	return {
		opacity: p,
		transform: p >= 1 ? undefined : `translateY(${(1 - p) * rise}px)`,
	};
};
