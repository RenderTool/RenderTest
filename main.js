import * as THREE from 'https://cdn.skypack.dev/three';
import { OrbitControls } from './common/OrbitControls';
import { TransformControls } from './common/TransformControls';
import { RGBELoader } from './common/RGBELoader';
import { LGLTracerRenderer, DisneyMaterial } from './common/lglTracer.es';
// Assets
import { makeCommonGUI } from './common/makeCommonGUI';
import {
	updateCameraFromModel,
	loadDracoGLTF,
	importGLTF,
	importHDR,
	loadLightConfig,
	getLocalStorage,
	setLocalStorage
} from './common/utils';
import { SimpleDropzone } from 'simple-dropzone';

const lights = [];
const envMapPath = '/002.hdr';
const gltfModelPath = '/FantasyBook/model1.glb';
let curModel = null;
let curEnvLight = null;
let loadingAssetFlag = false;
const uiContainerEle = document.querySelector('#container');
const loadingTextEle = document.querySelector('.loadingText');
const switchButtonEle = document.querySelector('.switchButton');
const curPipelineTextEle = document.querySelector('.curPipelineText');

// "RealTime" || "RayTracing"
let curPipeline = 'RayTracing';
let isRayTracingPipelineInited = false;
let isRealTimePipelineInited = false;
let isRayTracingPipelineNeedUpdateEnv = false;
let isRayTracingPipelineNeedUpdateTransform = false;
let isRayTracingPipelineNeedUpdateMaterial = false;
let rayTracingRAFID = null;
let realTimeRAFID = null;
let materialCacheMap = new Map();
let needSwitchFlag = false;

const envMapIntensity = 2;
// Init RayTracing Pipeline
const renderer = new LGLTracerRenderer({
	antialias: true
});
// Init RendererSetting
let initRendererSetting = {
	bounces: 2,
	envIntensity: envMapIntensity,
	toneMapping: THREE.ACESFilmicToneMapping,
	offFocusRender: true,
	useTileRender: true,
	tileSlicesNum: 4,
	movingDownsampling: true
};
function getRendererSettingFromLocalStorage() {
	let setting = getLocalStorage('lgl_editor_renderer_setting');
	if (setting) initRendererSetting = setting;
}
getRendererSettingFromLocalStorage();
renderer.bounces = initRendererSetting.bounces;
renderer.envMapIntensity = initRendererSetting.envIntensity;
renderer.toneMapping = initRendererSetting.toneMapping;
renderer.renderWhenOffFocus = initRendererSetting.offFocusRender;
renderer.useTileRender = initRendererSetting.useTileRender;
renderer.movingDownsampling = initRendererSetting.movingDownsampling;
renderer.tileSlicesNum = initRendererSetting.tileSlicesNum;

renderer.enableTemporalDenoise = false;
renderer.enableDenoise = false;
document.body.appendChild(renderer.domElement);
renderer.fullSampleCallback = () => {
	if (needSwitchFlag) {
		needSwitchFlag = false;
		switchPipelineImmedia();
	}
}

// Debug
const debug = true;
let initedAddDebug = false;
let rayTracingGUI = null;
let realTimeGUI = null;
const { initStats, initGUI, initCameraDebugInfo, initNewGUI } = makeCommonGUI(renderer);
renderer.loadingCallback = {
	onProgress: tipText => {
		console.log(tipText);
	},
	onComplete: tipText => {
		loadingTextEle.innerText = tipText;
		loadingAssetFlag = false;
		toggleLoadingTipsArea(false);
		if (!initedAddDebug) {
			initDenoiseSceneParam();
			const { gui, params, settingFolder, denoiseFolder } = initGUI(debug, renderer);
			denoiseFolder.close();
			rayTracingGUI = gui;
			params.saveSetting = () => {
				Object.keys(initRendererSetting).map(key => {
					switch (key) {
						case 'toneMapping':
							initRendererSetting[key] = THREE[`${params[key]}ToneMapping`];
							break;
						default:
							initRendererSetting[key] = params[key];
							break;
					}
				});
				setLocalStorage('lgl_editor_renderer_setting', initRendererSetting);
			};
			settingFolder.add(params, 'saveSetting');
			rayTracingGUI.close();
		}
		initedAddDebug = true;
		console.log(tipText);
	}
};

const stats = initStats(debug);
const cameraInfoEle = initCameraDebugInfo(debug);
let sampleCountRec = null;
let sampleCountCur = null;
function initDenoiseSceneParam() {
	renderer.setDenoiseColorFactor(0.05);
	renderer.setDenoisePositionFactor(0.01);
}

// Init RealTime Pipeline
const realTimeRenderer = new THREE.WebGLRenderer({
	canvas: renderer.domElement,
	context: renderer.gl,
	logarithmicDepthBuffer: true,
	premultipliedAlpha: true
});

realTimeRenderer.toneMapping = THREE.ACESFilmicToneMapping;
realTimeRenderer.toneMappingExposure = envMapIntensity;
realTimeRenderer.outputEncoding = THREE.sRGBEncoding;
realTimeRenderer.setPixelRatio(1);
// realTimeRenderer.setPixelRatio(window.devicePixelRatio);
realTimeRenderer.setClearAlpha(0);

// GUI
realTimeGUI = initNewGUI();
realTimeGUI.add({ envIntensity: envMapIntensity }, 'envIntensity', 0, 5, 0.5).onChange(value => {
	realTimeRenderer.toneMappingExposure = value;
});
let materialFolder = realTimeGUI.addFolder('Material');
realTimeGUI.hide();
let realTimeGUIParams = {};

// Init Scene
const scene = new THREE.Scene();
loadLightConfig(lights, scene);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.001, 1000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.screenSpacePanning = true;

//change Render Type
controls.addEventListener('start', () => { 
	switchPipelinejiaohu('RayTracing')
});

controls.addEventListener('end', () => {
	switchPipelinejiaohu('RealTime')
});

// Transform control
const transformControl = new TransformControls(camera, renderer.domElement);
const mouse = new THREE.Vector2();
let rayCaster = new THREE.Raycaster();

function updateGLTFScene(gltfInfo) {
	if (curModel) scene.remove(curModel);
	const gltfScene = gltfInfo.scene;
	scene.add(gltfScene);
	curModel = gltfScene;
	updateCameraFromModel(camera, controls, scene);
}

function updateEnvLight(envMap) {
	if (curEnvLight) curEnvLight.dispose();
	envMap.mapping = THREE.EquirectangularReflectionMapping;
	scene.environment = envMap;
	scene.background = envMap;
}

// UI Part
function markNeedUpdateRayTracingMaterial(mesh) {
	isRayTracingPipelineNeedUpdateMaterial = true;
	mesh.needUpdateRayTracingMaterial = true;
}

function apendParamsToGUIFolder(folder, params, mesh, material) {
	Object.keys(params).map(name => {
		switch (name) {
			case 'color':
			case 'specular':
				folder.addColor(params, name).onChange(value => {
					material[`${name}`].set(value);
					markNeedUpdateRayTracingMaterial(mesh);
				});
				break;
			case 'ior':
				folder.add(params, name, 1, 1.8, 0.01).onChange(value => {
					material[`${name}`] = value;
					markNeedUpdateRayTracingMaterial(mesh);
				});
				break;
			case 'visible':
				folder.add(params, name).onChange(value => {
					mesh.visible = value;
					isRayTracingPipelineNeedUpdateTransform = true;
				});
				break;
			default:
				folder.add(params, name, 0, 1, 0.01).onChange(value => {
					material[`${name}`] = value;
					markNeedUpdateRayTracingMaterial(mesh);
				});
				break;
		}
	});
}

function showRealTimeGUIByMaterial(mesh) {
	let material = mesh.material;
	realTimeGUI.removeFolder(materialFolder);
	materialFolder = realTimeGUI.addFolder(`Material: ${material.name}`);
	materialFolder.open();
	// Param
	realTimeGUIParams = {};
	let physicalMaterialGUIParams = {};
	realTimeGUIParams.color = material.color.getHex();
	if (material.isMeshStandardMaterial) {
		realTimeGUIParams.roughness = material.roughness;
		realTimeGUIParams.metalness = material.metalness;

		physicalMaterialGUIParams.transmission = material.transmission || 0;
		physicalMaterialGUIParams.ior = material.ior || 1.5;
		physicalMaterialGUIParams.clearcoat = material.clearcoat || 0;
		physicalMaterialGUIParams.clearcoatRoughness = material.clearcoatRoughness || 0;
		physicalMaterialGUIParams.sheen = material.sheen || 0;
		physicalMaterialGUIParams.sheenTint = material.sheenTint || 0.5;

		if (material.isGLTFSpecularGlossinessMaterial) {
			delete realTimeGUIParams.roughness;
			delete realTimeGUIParams.metalness;
			realTimeGUIParams.glossiness = material.glossiness;
			realTimeGUIParams.specular = material.specular.getHex();
		}
	}
	realTimeGUIParams.opacity = material.opacity;
	realTimeGUIParams.visible = mesh.visible;
	// Panel
	apendParamsToGUIFolder(materialFolder, realTimeGUIParams, mesh, material);
	// uvTransFolder
	let uvTransGUIParams = {};
	let uvTransFolder = materialFolder.addFolder(`Texture uvTransform: ${!!material.map}`);
	if (material.map) {
		const texture = material.map;
		uvTransGUIParams.offsetX = texture.offset.x;
		uvTransGUIParams.offsetY = texture.offset.y;
		uvTransGUIParams.repeatX = texture.repeat.x;
		uvTransGUIParams.repeatY = texture.repeat.y;
		uvTransGUIParams.rotation = texture.rotation;
		uvTransGUIParams.centerX = texture.center.x;
		uvTransGUIParams.centerY = texture.center.y;

		Object.keys(uvTransGUIParams).map(name => {
			let secName;
			let paramName;
			if (name.slice(-1) == 'X' || name.slice(-1) == 'Y') {
				secName = name.slice(-1).toLowerCase();
				paramName = name.slice(0, -1);
			}
			switch (name) {
				case 'rotation':
					uvTransFolder.add(uvTransGUIParams, name, 0, Math.PI, 0.01).onChange(value => {
						texture.rotation = value;
						markNeedUpdateRayTracingMaterial(mesh);
					});
					break;
				default:
					uvTransFolder.add(uvTransGUIParams, name, 0, 1, 0.01).onChange(value => {
						texture[`${paramName}`][`${secName}`] = value;
						markNeedUpdateRayTracingMaterial(mesh);
					});
					break;
			}
		});
		uvTransFolder.open();
	} else {
		uvTransFolder.close();
	}
	// PhysicalMaterialFolder
	let physicalMaterialFolder = materialFolder.addFolder(
		`isMeshPhysicalMaterial: ${!!material.isMeshPhysicalMaterial}`
	);
	if (material.isMeshPhysicalMaterial) {
		physicalMaterialFolder.open();
		apendParamsToGUIFolder(physicalMaterialFolder, physicalMaterialGUIParams, mesh, material);
	} else {
		physicalMaterialFolder.close();
	}
	realTimeGUI.show();
}

function showDropTips() {
	const bubbleEle = document.querySelector('#bubble');
	const editorBubbleEle = document.querySelector('#editorBubble');
	document.querySelector('#bubble-close').onclick = () => {
		bubbleEle.style.display = 'none';
	};
	if (!localStorage.getItem('editorLoadBubble')) {
		bubbleEle.style.display = 'block';
		// Got it btn
		document.querySelector('#bubble-confirm').onclick = () => {
			bubbleEle.style.display = 'none';
			localStorage.setItem('editorLoadBubble', true);
		};
	}
	document.querySelector('#editorBubble-close').onclick = () => {
		editorBubbleEle.style.display = 'none';
	};
	if (!localStorage.getItem('editorUseBubble')) {
		editorBubbleEle.style.display = 'block';
		// Got it btn
		document.querySelector('#editorBubble-confirm').onclick = () => {
			editorBubbleEle.style.display = 'none';
			localStorage.setItem('editorUseBubble', true);
		};
	}
}

function showErrorTips(text) {
	const bubbleEle = document.querySelector('#bubble');
	bubbleEle.style.display = 'block';
	document.querySelector('.bubble-text').innerText = text;
}

function toggleDropTipsArea(status) {
	if (status) {
		if (!uiContainerEle.classList.contains('isDroping')) uiContainerEle.classList.add('isDroping');
	} else {
		if (uiContainerEle.classList.contains('isDroping')) uiContainerEle.classList.remove('isDroping');
	}
}

function toggleLoadingTipsArea(status) {
	if (status) {
		if (!uiContainerEle.classList.contains('isLoading')) uiContainerEle.classList.add('isLoading');
	} else {
		if (uiContainerEle.classList.contains('isLoading')) uiContainerEle.classList.remove('isLoading');
	}
}

function initEvent() {
	// Asset loading
	const canvasEle = renderer.domElement;
	canvasEle.addEventListener('dragenter', event => {
		toggleDropTipsArea(true);
	});
	canvasEle.addEventListener('dragleave', event => {
		toggleDropTipsArea(false);
	});
	const dropCtrl = new SimpleDropzone(canvasEle, canvasEle);
	dropCtrl.on('drop', ({ files }) => {
		toggleDropTipsArea(false);
		if (loadingAssetFlag) {
			showErrorTips('previous assets no loading complete!');
			return;
		}
		loadingAssetFlag = true;
		loadingTextEle.innerText = 'Building...';
		toggleLoadingTipsArea(true);

		const filesArr = Array.from(files);
		const isGLTF = filesArr.find(([path, file]) => file.name.match(/\.(gltf|glb)$/));
		if (isGLTF) {
			importGLTF(files).then(gltfInfo => {
				transformControl.detach();
				scene.remove(transformControl);
				updateGLTFScene(gltfInfo);
				processSceneMaterial();
				// New scene, reset all mark
				isRayTracingPipelineInited = false;
				isRealTimePipelineInited = false;
				isRayTracingPipelineNeedUpdateEnv = false;
				isRayTracingPipelineNeedUpdateTransform = false;
				isRayTracingPipelineNeedUpdateMaterial = false;
				if (curPipeline === 'RayTracing') {
					switchMaterial('RayTracing');
					renderer.buildScene(scene, camera).then(() => {
						loadingAssetFlag = false;
						isRayTracingPipelineInited = true;
						toggleLoadingTipsArea(false);
					});
				} else {
					// Reset
					switchMaterial('RealTime');
					realTimeGUI.hide();
					isRealTimePipelineInited = true;
					loadingAssetFlag = false;
					toggleLoadingTipsArea(false);
				}
			});
		} else {
			const isHDR = filesArr.find(([path, file]) => file.name.match(/\.(hdr)$/));
			if (isHDR) {
				importHDR(files).then(envMap => {
					updateEnvLight(envMap);
					if (curPipeline === 'RayTracing') {
						renderer.updateEnvLight();
						renderer.needsUpdate = true;
					} else {
						isRayTracingPipelineNeedUpdateEnv = true;
					}

					loadingAssetFlag = false;
					toggleLoadingTipsArea(false);
				});
			} else {
				loadingAssetFlag = false;
				toggleLoadingTipsArea(false);
				showErrorTips('Incorrect resource type(support gltf/glb folder or hdr file)!');
			}
		}
	});
	dropCtrl.on('droperror', () => {
		console.log('Drop Error');
	});
	showDropTips();
	// Switch
	switchButtonEle.addEventListener('click', event => {
		switchPipeline();
		curPipelineTextEle.innerText = curPipeline;
	});
	// TransformControl
	renderer.domElement.addEventListener('dblclick', event => {
		if (curPipeline !== 'RealTime') return;
		mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
		mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
		rayCaster.setFromCamera(mouse, camera);
		const intersects = rayCaster.intersectObjects(curModel.children);
		if (intersects.length) {
			const target = intersects[0].object;
			transformControl.attach(target);
			scene.add(transformControl);
			// Open material editor panel
			showRealTimeGUIByMaterial(target);
		} else {
			scene.remove(transformControl);
			realTimeGUI.hide();
		}
	});
	transformControl.addEventListener('dragging-changed', event => {
		if (curPipeline !== 'RealTime') return;
		controls.enabled = !event.value;
		isRayTracingPipelineNeedUpdateTransform = true;
	});
	window.addEventListener('keydown', event => {
		if (event.keyCode == 81) {
			// Q
			switchPipeline();
			return;
		}
		if (curPipeline !== 'RealTime') return;
		switch (event.keyCode) {
			case 87: // W
				transformControl.setMode('translate');
				break;
			case 69: // E
				transformControl.setMode('rotate');
				break;
			case 82: // R
				transformControl.setMode('scale');
				break;
			case 32: // Spacebar
				transformControl.enabled = !transformControl.enabled;
				break;
		}
	});
}

function resize() {
	if (renderer.domElement.parentElement) {
		const width = window.innerWidth;
		const height =  window.innerHeight;//renderer.domElement.parentElement.clientHeight
		renderer.setSize(width, height);
		if (realTimeRenderer) realTimeRenderer.setSize(width, height);
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
	}
}

window.addEventListener('resize', resize);
resize();

// Init part
async function loadAssets() {
	const rgbeLoader = new RGBELoader().setDataType(THREE.FloatType);
	const envMap = await new Promise(resolve => {
		rgbeLoader.load(envMapPath, resolve);
	});
	updateEnvLight(envMap);

	const gltfInfo = await loadDracoGLTF(gltfModelPath);
	updateGLTFScene(gltfInfo);
}

function initRayTracingPipeline() {
	// Tips
	loadingAssetFlag = true;
	loadingTextEle.innerText = 'Building...';
	toggleLoadingTipsArea(true);

	switchMaterial('RayTracing');
	setTimeout(() => { // Show loadingTips dom
		renderer.buildScene(scene, camera).then(() => {
			isRayTracingPipelineInited = true;
			rayTracingDraw();
		});
	}, 100);
}

function initRealTimePipeline() {
	toggleLoadingTipsArea(false);
	isRealTimePipelineInited = true;
	realTimeDraw();
}

// Update part
function processSceneMaterial() {
	// Reuse the same Material
	materialCacheMap = new Map();
	scene.traverse(node => {
		if (node.isMesh && node.material) {
			let rayTracingMaterial = materialCacheMap.get(node.material);
			if (rayTracingMaterial === undefined) {
				if (node.material.isMeshStandardMaterial) {
					node.realTimeMaterial = node.material;
					node.rayTracingMaterial = new DisneyMaterial().fromStandardMaterial(node.material);
				} else if (!node.material.isRayTracingMaterial) {
					node.realTimeMaterial = node.material;
					node.rayTracingMaterial = new DisneyMaterial().fromBasicMaterial(node.material);
				}
				materialCacheMap.set(node.material, node.rayTracingMaterial);
			} else {
				node.realTimeMaterial = node.material;
				node.rayTracingMaterial = rayTracingMaterial;
			}
		}
	});
}

function updateRayTracingMaterial() {
	scene.traverse(node => {
		if (node.isMesh && node.needUpdateRayTracingMaterial) {
			node.rayTracingMaterial.fromStandardMaterial(node.realTimeMaterial);
			node.needUpdateRayTracingMaterial = false;
		}
	});
}

function switchMaterial(targetPipeline) {
	scene.traverse(child => {
		if (child.isMesh) {
			if (targetPipeline === 'RealTime') {
				if (child.material.isRayTracingMaterial && child.realTimeMaterial) {
					child.material = child.realTimeMaterial;
				}
			} else {
				if (!child.material.isRayTracingMaterial && child.rayTracingMaterial) {
					child.material = child.rayTracingMaterial;
				}
			}
		}
	});
}

function switchGUI(targetPipeline) {
	if (targetPipeline === 'RayTracing') {
		if (rayTracingGUI) rayTracingGUI.show();
		if (realTimeGUI) realTimeGUI.hide();
	} else {
		// if (realTimeGUI) realTimeGUI.show(); // Event emitter
		if (rayTracingGUI) rayTracingGUI.hide();
	}
}

function switchPipeline() {
	if (curPipeline === 'RealTime') {
		switchPipelineImmedia();
	} else {
		needSwitchFlag = true;
	}
}
function switchPipelinejiaohu(e) {
	if (curPipeline === e) {
		switchPipelineImmedia();
	} else {
		needSwitchFlag = true;
	}
}

function switchPipelineImmedia() {
	// Stop RAF
	cancelAnimationFrame(realTimeRAFID);
	cancelAnimationFrame(rayTracingRAFID);
	// Drawcall
	if (curPipeline === 'RealTime') {
		// Switch to RayTracing pipeline
		scene.remove(transformControl);
		transformControl.enabled = false;
		switchMaterial('RayTracing');
		if (!isRayTracingPipelineInited) {
			if (isRayTracingPipelineNeedUpdateMaterial) updateRayTracingMaterial();
			initRayTracingPipeline();
		} else {
			if (isRayTracingPipelineNeedUpdateEnv) {
				renderer.updateEnvLight();
				renderer.needsUpdate = true;
				isRayTracingPipelineNeedUpdateEnv = false;
			}
			if (isRayTracingPipelineNeedUpdateTransform) {
				renderer.updateMeshTransform();
				renderer.needsUpdate = true;
				isRayTracingPipelineNeedUpdateTransform = false;
			}
			if (isRayTracingPipelineNeedUpdateMaterial) {
				updateRayTracingMaterial();
				renderer.updateMeshMaterial();
				renderer.needsUpdate = true;
				isRayTracingPipelineNeedUpdateMaterial = false;
			}
			rayTracingDraw();
		}
		switchGUI('RayTracing');
		curPipeline = 'RayTracing';
	} else {
		realTimeRenderer.resetState();
		switchMaterial('RealTime');
		if (!isRealTimePipelineInited) {
			initRealTimePipeline();
		} else {
			realTimeDraw();
		}
		transformControl.enabled = true;
		switchGUI('RealTime');
		curPipeline = 'RealTime';
	}
	controls.enabled = true;
}

function rayTracingDraw(time) {
	rayTracingRAFID = requestAnimationFrame(rayTracingDraw);
	controls.update();
	if (debug && stats) stats.begin();

	renderer.render(scene, camera);

	if (debug && stats) stats.end();
	if (debug && cameraInfoEle && cameraInfoEle.dataBegin) {
		sampleCountCur = renderer.getTotalSamples();
		if (sampleCountRec != sampleCountCur) {
			cameraInfoEle.innerText = `Samples: ${sampleCountCur}`;
			sampleCountRec = sampleCountCur;
		}
	}
}

function realTimeDraw() {
	realTimeRAFID = requestAnimationFrame(realTimeDraw);
	controls.update();
	if (realTimeRenderer) realTimeRenderer.render(scene, camera);
}

async function init() {
	await loadAssets();
	processSceneMaterial();
	if (curPipeline === 'RealTime') {
		initRealTimePipeline();
	} else {
		initRayTracingPipeline();
	}
	initEvent();
	curPipelineTextEle.innerText = curPipeline;
}

init();
