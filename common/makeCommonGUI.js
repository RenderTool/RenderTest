import * as THREE from 'three';
// Debug
import Stats from './stats.module';
import { GUI } from './dat.gui.module';
import { toneMappingList, threeToneMappingStrMap } from './const/guiConfig';

const offScreenCanvas = document.createElement('canvas');
const offScreenCtx = offScreenCanvas.getContext('2d');
function downloadSceneImage(name, fileFormat = 'jpeg') {
	let imgData = offScreenCanvas.toDataURL(`image/${fileFormat}`);
	try {
		imgData.replace(`image/${fileFormat}`, 'image/octet-stream');
		let link = document.createElement('a');
		link.style.display = 'none';
		document.body.appendChild(link);
		link.href = imgData;
		link.download = `${name}.${fileFormat}`;
		link.click();
	} catch (error) {
		console.error(error);
		alert(error);
	}
}

export function makeCommonGUI() {
	let showSampleCount = false;
	let showStats = false;
	let cameraInfoEle = document.getElementById('cameraInfo');
	if (cameraInfoEle) {
		cameraInfoEle.style.display = 'none';
		cameraInfoEle.dataBegin = false;
	}
	let statsEle = null;

	function initCameraDebugInfo(debug) {
		if (!debug) return;
		return cameraInfoEle;
	}

	function initStats(debug) {
		if (!debug) return;
		const stats = new Stats();
		stats.setMode(0); // 0: fps, 1: ms
		stats.domElement.style.position = 'absolute';
		stats.domElement.style.left = '10px';
		stats.domElement.style.top = 'auto';
		stats.domElement.style.bottom = '30px';
		document.body.appendChild(stats.domElement);
		statsEle = stats.domElement;
		statsEle.style.display = 'none';
		return stats;
	}

	function initNewGUI() {
		const gui = new GUI({
			closeOnTop: true
		});
		return gui;
	}

	function initGUI(debug, renderer) {
		if (!debug) return;
		const gui = new GUI({
			closeOnTop: true
		});
		// gui.close();
		const { colorBlendFactor, momentBlendFactor, colorFactor, normalFactor, positionFactor } =
			renderer.getDenoiseFactors();
		const params = {
			bounces: renderer.bounces,
			envIntensity: renderer.envMapIntensity,
			enviromentVisible: renderer.enviromentVisible,
			useBackgroundColor: renderer.useBackgroundColor,
			backgroundColor: renderer.backgroundColor.getHex(),
			toneMapping: threeToneMappingStrMap[renderer.toneMapping],
			offFocusRender: renderer.renderWhenOffFocus,
			useTileRender: renderer.useTileRender,
			tileSlicesNum: renderer.tileSlicesNum || 0,
			movingDownsampling: renderer.movingDownsampling,
			enableDenoise: !!renderer.enableDenoise,
			enableTemporal: !!renderer.enableTemporalDenoise,
			colorBlend: colorBlendFactor,
			momentBlend: momentBlendFactor,
			enableSpatial: !!renderer.enableSpatialDenoise,
			colorFactor: colorFactor,
			normalFactor: normalFactor,
			positionFactor: positionFactor,
			demodulateAlbedo: false,
			sampleCount: showSampleCount,
			stats: showStats,
			saveScreenShot: () => {
				const width = renderer.size.x;
				const height = renderer.size.y;
				offScreenCanvas.width = width;
				offScreenCanvas.height = height;
				let finished = false;
				renderer.fullSampleCallback = () => {
					if (finished) return;
					offScreenCtx.drawImage(renderer.domElement, 0, 0);
					downloadSceneImage(`LGLTracer`, 'png');
					finished = true;
				};
			},
			deleteAllGUI: () => {
				gui.domElement.parentElement.remove(gui.domElement);
			},
			dispose: () => {
				renderer.dispose();
			},
			updateTransform: () => {
				renderer.updateMeshTransform();
			},
			updateMaterial: () => {
				renderer.updateMeshMaterial();
			}
		};
		const settingFolder = gui.addFolder('Setting');
		settingFolder
			.add(params, 'bounces', 2, 8)
			.step(1)
			.onFinishChange(value => {
				renderer.bounces = value;
				renderer.needsUpdate = true;
			});
		settingFolder
			.add(params, 'envIntensity', 0, 5)
			.step(0.5)
			.onFinishChange(value => {
				renderer.envMapIntensity = value;
				renderer.needsUpdate = true;
			});
		settingFolder.add(params, 'useBackgroundColor').onChange(value => {
			renderer.useBackgroundColor = value;
			renderer.needsUpdate = true;
		});
		settingFolder.addColor(params, 'backgroundColor').onChange(value => {
			renderer.backgroundColor.set(value);
			renderer.updateBackgroundColor();
			renderer.needsUpdate = true;

		});

		settingFolder.add(params, 'toneMapping', toneMappingList).onChange(value => {
			const toneMappingValue = THREE[`${value}ToneMapping`];
			renderer.toneMapping = toneMappingValue;
		});
		settingFolder.add(params, 'offFocusRender').onChange(value => {
			renderer.renderWhenOffFocus = value;
		});
		settingFolder.add(params, 'useTileRender').onChange(value => {
			if (value) {
				params.movingDownsampling = true;
				settingFolder.updateDisplay();
				renderer.movingDownsampling = value;
			}
			renderer.useTileRender = value;
			renderer.needsUpdate = true;
		});
		settingFolder.add(params, 'tileSlicesNum', 0, 32, 1).onFinishChange(value => {
			if (cameraInfoEle.style.display === 'none') {
				cameraInfoEle.dataBegin = true;
				cameraInfoEle.style.display = 'block';
			}
			if (!params.useTileRender) {
				params.useTileRender =  true;
				renderer.useTileRender = true;
				if (!params.movingDownsampling) {
					params.movingDownsampling = true;
					renderer.movingDownsampling = value;
				}
				settingFolder.updateDisplay();
			}
			renderer.tileSlicesNum = value;
			renderer.setTileSlicesNumber(value);
			params.sampleCount = true;
			guiFolder.updateDisplay();
			renderer.needsUpdate = true;
		});
		settingFolder.add(params, 'movingDownsampling').onChange(value => {
			renderer.movingDownsampling = value;
		});

		const guiFolder = gui.addFolder('Debug UI');
		guiFolder.add(params, 'sampleCount').onChange(value => {
			if (!cameraInfoEle) return;
			if (!value) {
				cameraInfoEle.dataBegin = false;
				cameraInfoEle.style.display = 'none';
			} else {
				cameraInfoEle.dataBegin = true;
				cameraInfoEle.style.display = 'block';
			}
		});
		guiFolder.add(params, 'stats').onChange(value => {
			if (!statsEle) return;
			if (!value) {
				statsEle.style.display = 'none';
			} else {
				statsEle.style.display = 'block';
			}
		});
		guiFolder.add(params, 'saveScreenShot');
		guiFolder.add(params, 'deleteAllGUI');
		const denoiseFolder = gui.addFolder('Denoise(SVGF)');
		denoiseFolder
			.add(params, 'enableDenoise')
			.name('enable')
			.onChange(value => {
				renderer.enableDenoise = value;
			});
		denoiseFolder.add(params, 'enableTemporal').onChange(value => {
			renderer.enableTemporalDenoise = value;
			renderer.needsUpdate = true;
		});
		denoiseFolder
			.add(params, 'colorBlend', 0, 1)
			.step(0.001)
			.onFinishChange(value => {
				renderer.setDenoiseColorBlendFactor(value);
			});
		denoiseFolder
			.add(params, 'momentBlend', 0, 1)
			.step(0.001)
			.onFinishChange(value => {
				renderer.setDenoiseMomentBlendFactor(value);
			});
		denoiseFolder.add(params, 'enableSpatial').onChange(value => {
			renderer.enableSpatialDenoise = value;
			renderer.needsUpdate = true;
		});
		denoiseFolder
			.add(params, 'colorFactor', 0, 5)
			.step(0.001)
			.onFinishChange(value => {
				renderer.setDenoiseColorFactor(value);
			});
		denoiseFolder
			.add(params, 'normalFactor', 0, 1)
			.step(0.01)
			.onFinishChange(value => {
				renderer.setDenoiseNormalFactor(value);
			});
		denoiseFolder
			.add(params, 'positionFactor', 0, 0.5)
			.step(0.001)
			.onFinishChange(value => {
				renderer.setDenoisePositionFactor(value);
			});

		settingFolder.open();
		// guiFolder.open();
		// denoiseFolder.open();

		return {
			gui,
			params,
			settingFolder,
			denoiseFolder
		};
	}

	return {
		initStats,
		initGUI,
		initCameraDebugInfo,
		initNewGUI,
	};
}
