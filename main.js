import * as THREE from 'three';
import { OrbitControls } from './common/OrbitControls';
import { TransformControls } from './common/TransformControls';
import { RGBELoader } from './common/RGBELoader';
import { LGLTracerRenderer, DisneyMaterial } from './common/lglTracer.es';
import { GUI } from './common/dat.gui.module';
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
var w = $('#render_view').innerWidth();
var h = $('#render_view').innerHeight();

const envMapIntensity = 1.0;
// Init RayTracing Pipeline
const renderer = new LGLTracerRenderer({
	antialias: true,
	preserveDrawingBuffer: true,
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
// document.body.appendChild(renderer.domElement);
document.getElementById('render_view').appendChild( renderer.domElement );
	

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
//add env
	let shot = false;
	const offScreenCanvas = document.createElement('canvas');
	const offScreenCtx = offScreenCanvas.getContext('2d');
	offScreenCanvas.width = w;
	offScreenCanvas.height = h;

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
renderer.fullSampleCallback = ()=> {
		
		if (shot == !0) {
			offScreenCtx.drawImage(renderer.domElement, 0, 0);
			downloadSceneImage("LGLTracer", 'png');
			shot = !1;
		}
	};
const envMaps = {
	'hdr1':'./hdr/001.hdr',
	'hdr2': './hdr/002.hdr',
	'hdr3': './hdr/003.hdr',
	'hdr4': './hdr/004.hdr',
};
const Mods = {
	'models0':'./models/sp.gltf',
	'models1':'./models/1454383.glb',
	'models2': './models/1454455.glb',
	'models3': './models/1454537.glb',
	'models4': './models/1465501.glb',
	'models5': './models/1486655.glb',
	'models6': './models/1454551.glb',
	'models7': './models/1472590.glb',
	
};

const gui = new GUI({
	closeOnTop: true
});
const params = {
	Mod:Mods['models7'],
	envMap: envMaps[ 'hdr2' ],//envmap
	saveScreenShot: () => {
	shot= true;
	}
}
const settingFolder = gui.addFolder('设置');
settingFolder.add( params, 'envMap', envMaps ).name( '环境光' ).onChange( LoadEnv );
settingFolder.add( params, 'Mod', Mods ).name( '模型' ).onChange( LoadGLTF );
settingFolder.add(params, 'saveScreenShot').name('截图');
async function LoadEnv() {

	const rgbeLoader = new RGBELoader().setDataType(THREE.FloatType);
	const envMap = await new Promise(resolve => {
		rgbeLoader.load(params.envMap, resolve);
	});
	updateEnvLight(envMap);
	renderer.updateEnvLight();
	renderer.needsUpdate = true;
}
async function LoadGLTF() {
	toggleLoadingTipsArea(true);
	const gltfInfo = await loadDracoGLTF(params.Mod);
	updateGLTFScene(gltfInfo);
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
}

realTimeGUI = initNewGUI();
realTimeGUI.add({ envIntensity: envMapIntensity }, 'envIntensity', 0, 10, 0.5).onChange(value => {
	realTimeRenderer.toneMappingExposure = value;
});
let materialFolder = realTimeGUI.addFolder('Material');
realTimeGUI.hide();
let realTimeGUIParams = {};

// Init Scene
const scene = new THREE.Scene();
loadLightConfig(lights, scene);

const camera = new THREE.PerspectiveCamera(45, w / h, 0.001, 1000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.screenSpacePanning = true;

// Transform control
const transformControl = new TransformControls(camera, renderer.domElement);
const mouse = new THREE.Vector2();
let rayCaster = new THREE.Raycaster();
resize();

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
var w = $('#render_view').innerWidth();
var h = $('#render_view').innerHeight();
	if (renderer.domElement.parentElement) {
		// const width =renderer.domElement.parentElement.clientWidth,
		// height = renderer.domElement.parentElement.clientHeight
		renderer.setSize(w, h);
		if (realTimeRenderer) realTimeRenderer.setSize(w, h);
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
		offScreenCanvas.width = w;
		offScreenCanvas.height = h;
	}
}

window.addEventListener('resize', resize);
resize();

// Init part
async function loadAssets() {
	const rgbeLoader = new RGBELoader().setDataType(THREE.FloatType);
	const envMap = await new Promise(resolve => {
		rgbeLoader.load( envMaps['hdr2'], resolve);
	});
	updateEnvLight(envMap);

	const gltfInfo = await loadDracoGLTF(Mods['models7']);
	updateGLTFScene(gltfInfo);
	
	//change Render Type
	controls.addEventListener('start', () => { 
		switchPipelinejiaohu('RayTracing')
	});

	controls.addEventListener('end', () => {
		switchPipelinejiaohu('RealTime')
	});
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
(function () {

	var util = {
		css: function (elem, obj) {
			for (var i in obj) {
				elem.style[i] = obj[i];
			}
		},
		hasClass: function (elem, classN) {
			var className = elem.getAttribute("class");
			return className.indexOf(classN) != -1;
		}
	};

	function Colorpicker(opt) {
		if (this === window) throw `Colorpicker: Can't call a function directly`;
		this.init(opt);
	};

	Colorpicker.prototype = {
		init(opt) {
			let { el, initColor = "rgb(255,0,0)", allMode = ['hex', 'rgb'], color = '' } = opt;
			var elem = document.getElementById(el);

			if (!(elem && elem.nodeType && elem.nodeType === 1)) {
				throw `Colorpicker: not found  ID:${el}  HTMLElement,not ${{}.toString.call(el)}`;
			}

			this.Opt = {
				...opt,
				el,
				initColor,
				allMode,
				color
			}

			this.bindElem = elem; // 绑定的元素
			this.elem_wrap = null; // 最外层容器
			this.fixedBg = null; // 拾色器后面固定定位的透明div 用于点击隐藏拾色器
			this.elem_colorPancel = null; // 色彩面板
			this.elem_picker = null; // 拾色器色块按钮
			this.elem_barPicker1 = null; // 颜色条
			this.elem_hexInput = null; // 显示hex的表单
			this.elem_showColor = null; // 显示当前颜色
			this.elem_showModeBtn = null; // 切换输入框模式按钮
			this.elem_inputWrap = null; // 输入框外层容器

			this.pancelLeft = 0;
			this.pancelTop = 0;

			this.downX = 0;
			this.downY = 0;
			this.moveX = 0;
			this.moveY = 0;

			this.pointLeft = 0;
			this.pointTop = 0;

			this.current_mode = 'hex'; // input框当前的模式

			this.rgba = { r: 0, g: 0, b: 0, a: 1 };
			this.hsb = { h: 0, s: 100, b: 100 };


			var _this = this, rgb = initColor.slice(4, -1).split(",");

			this.rgba.r = parseInt(rgb[0]);
			this.rgba.g = parseInt(rgb[1]);
			this.rgba.b = parseInt(rgb[2]);

			var body = document.getElementsByTagName("body")[0],
				div = document.createElement("div");

			div.innerHTML = this.render();
			body.appendChild(div);

			this.elem_wrap = div;
			this.fixedBg = div.children[0];
			this.elem_colorPancel = div.getElementsByClassName("color-pancel")[0];
			this.pancel_width = this.elem_colorPancel.offsetWidth;
			this.pancel_height = this.elem_colorPancel.offsetHeight;
			this.elem_picker = div.getElementsByClassName("pickerBtn")[0];
			this.elem_colorPalette = div.getElementsByClassName("color-palette")[0];
			this.elem_showColor = div.getElementsByClassName("colorpicker-showColor")[0];
			this.elem_barPicker1 = div.getElementsByClassName("colorBar-color-picker")[0];
			/*   this.elem_barPicker2 = div.getElementsByClassName("colorBar-opacity-picker")[0]; */
			this.elem_hexInput = div.getElementsByClassName("colorpicker-hexInput")[0];
			this.elem_showModeBtn = div.getElementsByClassName("colorpicker-showModeBtn")[0];
			this.elem_inputWrap = div.getElementsByClassName("colorpicker-inputWrap")[0];
			/*  this.elem_opacityPancel = this.elem_barPicker2.parentNode.parentNode.children[1]; */

			// var rect = this.bindElem.getBoundingClientRect();
			var elem = this.bindElem;
			var top = elem.offsetTop;
			var left = elem.offsetLeft;
			while (elem.offsetParent) {
				top += elem.offsetParent.offsetTop;
				left += elem.offsetParent.offsetLeft;
				elem = elem.offsetParent;
			}

			this.pancelLeft = left + this.elem_colorPalette.clientWidth;
			this.pancelTop = top + this.bindElem.offsetHeight;
			util.css(div, {
				"position": "absolute",
				"z-index": 2,
				"display": 'none',
				"left": left + "px",
				"top": top + this.bindElem.offsetHeight + "px"
			});

			this.bindMove(this.elem_colorPancel, this.setPosition, true);
			this.bindMove(this.elem_barPicker1.parentNode, this.setBar, false);
			/*  this.bindMove(this.elem_barPicker2.parentNode,this.setBar,false); */

			this.bindElem.addEventListener("click", function () {
				_this.show();
			}, false);

			this.fixedBg.addEventListener("click", function (e) {
				_this.hide();
			}, false)

			this.elem_showModeBtn.addEventListener("click", function () {
				_this.switch_current_mode();
			}, false)

			this.elem_wrap.addEventListener("input", function (e) {
				var target = e.target, value = target.value;
				_this.setColorByInput(value);
			}, false);

			this.elem_colorPalette.addEventListener("click", function (e) {
				if (e.target.tagName.toLocaleLowerCase() == "p") {
					let colorStr = e.target.style.background;
					let rgb = colorStr.slice(4, -1).split(",");
					let rgba = {
						r: parseInt(rgb[0]),
						g: parseInt(rgb[1]),
						b: parseInt(rgb[2])
					}
					switch (_this.current_mode) {
						case "hex":
							_this.setColorByInput("#" + _this.rgbToHex(rgba))
							break;
						case 'rgb':
							let inputs = _this.elem_wrap.getElementsByTagName("input")
							inputs[0].value = rgba.r;
							inputs[1].value = rgba.g;
							inputs[2].value = rgba.b;
							_this.setColorByInput(colorStr)
							/* 	_this.hsb = _this.rgbToHsb(rgba); */
							break;
					}

				}
			}, false);

			(color != '' && this.setColorByInput(color));
		},
		render: function () {
			var tpl =
				`<div style="position: fixed; top: 0px; right: 0px; bottom: 0px; left: 0px;"></div>
				<div style="position: inherit;z-index: 100;display: flex;box-shadow: rgba(0, 0, 0, 0.3) 0px 0px 2px, rgba(0, 0, 0, 0.3) 0px 4px 8px;">
					<div style='width:180px;padding:10px;background: #f9f9f9;display: flex;flex-flow: row wrap;align-content: space-around;justify-content: space-around ;display:none;;' class='color-palette'>
						${this.getPaletteColorsItem()}
					</div>
					<div class="colorpicker-pancel" style="background: rgb(255, 255, 255);box-sizing: initial; width: 225px; font-family: Menlo;">
						<div style="width: 100%; padding-bottom: 55%; position: relative; border-radius: 2px 2px 0px 0px; overflow: hidden;">
							<div class="color-pancel" style="position: absolute; top: 0px; right: 0px; bottom: 0px; left: 0px; background: rgb(${this.rgba.r},${this.rgba.g},${this.rgba.b})">
								<style>
									.saturation-white {background: -webkit-linear-gradient(to right, #fff, rgba(255,255,255,0));background: linear-gradient(to right, #fff, rgba(255,255,255,0));}
									.saturation-black {background: -webkit-linear-gradient(to top, #000, rgba(0,0,0,0));background: linear-gradient(to top, #000, rgba(0,0,0,0));}
								</style>
								<div class="saturation-white" style="position: absolute; top: 0px; right: 0px; bottom: 0px; left: 0px;">
									<div class="saturation-black" style="position: absolute; top: 0px; right: 0px; bottom: 0px; left: 0px;">
									</div>
									<div class="pickerBtn" style="position: absolute; top: 0%; left: 100%; cursor: default;">
										<div style="width: 12px; height: 12px; border-radius: 6px; box-shadow: rgb(255, 255, 255) 0px 0px 0px 1px inset; transform: translate(-6px, -6px);">
										</div>
									</div>
								</div>
							</div>
						</div>
						<div style="padding: 0 16px 20px;">
							<div class="flexbox-fix" style="display: flex;align-items: center;height: 40px;">
								<div style="width: 32px;">
									<div style="width: 16px; height: 16px; border-radius: 8px; position: relative; overflow: hidden;">
										<div class="colorpicker-showColor" style="position: absolute; top: 0px; right: 0px; bottom: 0px; left: 0px; border-radius: 8px; box-shadow: rgba(0, 0, 0, 0.1) 0px 0px 0px 1px inset; background:rgb(${this.rgba.r},${this.rgba.g},${this.rgba.b}); z-index: 2;"></div>
										<div class="" style="position: absolute; top: 0px; right: 0px; bottom: 0px; left: 0px; background: url(&quot;data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/nYDCgBDAm9BGDWAAJyRCgLaBCAAgXwixzAS0pgAAAABJRU5ErkJggg==&quot;) left center;"></div>
									</div>
								</div>
								<div style="-webkit-box-flex: 1; flex: 1 1 0%;"><div style="height: 10px; position: relative;">
									<div style="position: absolute; top: 0px;right: 0px; bottom: 0px; left: 0px;">
										<div class="hue-horizontal" style="padding: 0px 2px; position: relative; height: 100%;">
											<style>
												.hue-horizontal {background: linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%);background: -webkit-linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%);}
												.hue-vertical {background: linear-gradient(to top, #f00 0%, #ff0 17%, #0f0 33%,#0ff 50%, #00f 67%, #f0f 83%, #f00 100%);background: -webkit-linear-gradient(to top, #f00 0%, #ff0 17%,#0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%);}
											</style>
											<div  class="colorBar-color-picker" style="position: absolute; left: 0%;">
												<div style="width: 12px; height: 12px; border-radius: 6px; transform: translate(-6px, -1px); background-color: rgb(248, 248, 248); box-shadow: rgba(0, 0, 0, 0.37) 0px 1px 4px 0px;">
												</div>
											</div>
										</div>
									</div>
								</div>
							</div>
						</div>
						<div class="flexbox-fix" style="display: flex;">
							<div class="flexbox-fix colorpicker-inputWrap" style="-webkit-box-flex: 1; flex: 1 1 0%; display: flex; margin-left: -6px;">
									${this.getInputTpl()}
							</div>
							<div class="colorpicker-showModeBtn" style="width: 32px; text-align: right; position: relative;">
								<div style="margin-right: -4px;  cursor: pointer; position: relative;">
									<svg viewBox="0 0 24 24" style="width: 24px; height: 24px; border: 1px solid transparent; border-radius: 5px;"><path fill="#333" d="M12,5.83L15.17,9L16.58,7.59L12,3L7.41,7.59L8.83,9L12,5.83Z"></path><path fill="#333" d="M12,18.17L8.83,15L7.42,16.41L12,21L16.59,16.41L15.17,15Z"></path></svg>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>`;
			return tpl;
		},
		getInputTpl: function () {
			var current_mode_html = "";
			switch (this.current_mode) {
				case 'hex':
					var hex = "#" + this.rgbToHex(this.HSBToRGB(this.hsb));
					current_mode_html += `
							<div style="padding-left: 6px; width: 100%;">
								<div style="position: relative;">
									<input class="colorpicker-hexInput" value="${hex}" spellcheck="false" style="font-size: 11px; color: rgb(51, 51, 51); width: 100%; border-radius: 2px; border: none; box-shadow: rgb(218, 218, 218) 0px 0px 0px 1px inset; height: 21px; text-align: center;">
									<span style="text-transform: uppercase; font-size: 11px; line-height: 11px; color: rgb(150, 150, 150); text-align: center; display: block; margin-top: 12px;">hex</span>
								</div>
							</div>`;
					break;
				case 'rgb':
					for (var i = 0; i < 3; i++) {
						current_mode_html +=
							`<div style="padding-left: 6px; width: 100%;">
								<div style="position: relative;">
									<input class="colorpicker-hexInput" value="${this.rgba['rgb'[i]]}" spellcheck="false" style="font-size: 11px; color: rgb(51, 51, 51); width: 100%; border-radius: 2px; border: none; box-shadow: rgb(218, 218, 218) 0px 0px 0px 1px inset; height: 21px; text-align: center;">
									<span style="text-transform: uppercase; font-size: 11px; line-height: 11px; color: rgb(150, 150, 150); text-align: center; display: block; margin-top: 12px;">${'rgb'[i]}</span>
								</div>
							</div>`;
					}
				default:
			}
			return current_mode_html;
		},
		getPaletteColorsItem: function () {
			let str = '';
			let palette = ["rgb(0, 0, 0)", "rgb(67, 67, 67)", "rgb(102, 102, 102)", "rgb(204, 204, 204)", "rgb(217, 217, 217)", "rgb(255, 255, 255)",
				"rgb(152, 0, 0)", "rgb(255, 0, 0)", "rgb(255, 153, 0)", "rgb(255, 255, 0)", "rgb(0, 255, 0)", "rgb(0, 255, 255)",
				"rgb(74, 134, 232)", "rgb(0, 0, 255)", "rgb(153, 0, 255)", "rgb(255, 0, 255)", "rgb(230, 184, 175)", "rgb(244, 204, 204)",
				"rgb(252, 229, 205)", "rgb(255, 242, 204)", "rgb(217, 234, 211)", "rgb(208, 224, 227)", "rgb(201, 218, 248)", "rgb(207, 226, 243)",
				"rgb(217, 210, 233)", "rgb(234, 209, 220)", "rgb(221, 126, 107)", "rgb(234, 153, 153)", "rgb(249, 203, 156)", "rgb(255, 229, 153)",
				"rgb(182, 215, 168)", "rgb(162, 196, 201)", "rgb(164, 194, 244)", "rgb(159, 197, 232)", "rgb(180, 167, 214)"]
			palette.forEach(item => str += `<p style='width:20px;height:20px;background:${item};margin:0 5px;border: solid 1px #d0d0d0;'></p>`)
			return str;
		},
		setPosition(x, y) {
			var LEFT = parseInt(x - this.pancelLeft),
				TOP = parseInt(y - this.pancelTop);

			this.pointLeft = Math.max(0, Math.min(LEFT, this.pancel_width));
			this.pointTop = Math.max(0, Math.min(TOP, this.pancel_height));

			util.css(this.elem_picker, {
				left: this.pointLeft + "px",
				top: this.pointTop + "px"
			})
			this.hsb.s = parseInt(100 * this.pointLeft / this.pancel_width);
			this.hsb.b = parseInt(100 * (this.pancel_height - this.pointTop) / this.pancel_height);

			this.setShowColor();
			this.setValue(this.rgba);

		},
		setBar: function (elem, x) {
			var elem_bar = elem.getElementsByTagName("div")[0],
				rect = elem.getBoundingClientRect(),
				elem_width = elem.offsetWidth,
				X = Math.max(0, Math.min(x - rect.x, elem_width));

			if (elem_bar === this.elem_barPicker1) {
				util.css(elem_bar, {
					left: X + "px"
				});
				this.hsb.h = parseInt(360 * X / elem_width);
			} else {
				util.css(elem_bar, {
					left: X + "px"
				});
				this.rgba.a = X / elem_width;
			}

			this.setPancelColor(this.hsb.h);
			this.setShowColor();
			this.setValue(this.rgba);

		},
		setPancelColor: function (h) {
			var rgb = this.HSBToRGB({ h: h, s: 100, b: 100 });

			util.css(this.elem_colorPancel, {
				background: 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + this.rgba.a + ')'
			});
		},
		setShowColor: function () {
			var rgb = this.HSBToRGB(this.hsb);

			this.rgba.r = rgb.r;
			this.rgba.g = rgb.g;
			this.rgba.b = rgb.b;

			util.css(this.elem_showColor, {
				background: 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + this.rgba.a + ')'
			});
		},
		setValue: function (rgb) {
			var hex = "#" + this.rgbToHex(rgb);
			this.elem_inputWrap.innerHTML = this.getInputTpl();
			this.Opt.change(this.bindElem, hex);
		},
		setColorByInput: function (value) {
			var _this = this;
			switch (this.current_mode) {
				case "hex":
					value = value.slice(1);
					if (value.length == 3) {
						value = '#' + value[0] + value[0] + value[1] + value[1] + value[2] + value[2];
						this.hsb = this.hexToHsb(value);
					} else if (value.length == 6) {
						this.hsb = this.hexToHsb(value);
					}
					break;
				case 'rgb':
					var inputs = this.elem_wrap.getElementsByTagName("input"),
						rgb = {
							r: inputs[0].value ? parseInt(inputs[0].value) : 0,
							g: inputs[1].value ? parseInt(inputs[1].value) : 0,
							b: inputs[2].value ? parseInt(inputs[2].value) : 0
						};

					this.hsb = this.rgbToHsb(rgb);
			}
			this.changeViewByHsb();
		},
		changeViewByHsb: function () {
			this.pointLeft = parseInt(this.hsb.s * this.pancel_width / 100);
			this.pointTop = parseInt((100 - this.hsb.b) * this.pancel_height / 100);
			util.css(this.elem_picker, {
				left: this.pointLeft + "px",
				top: this.pointTop + "px"
			});

			this.setPancelColor(this.hsb.h);
			this.setShowColor();
			util.css(this.elem_barPicker1, {
				left: this.hsb.h / 360 * (this.elem_barPicker1.parentNode.offsetWidth) + "px"
			});

			var hex = '#' + this.rgbToHex(this.HSBToRGB(this.hsb));
			this.Opt.change(this.bindElem, hex);
		},
		switch_current_mode: function () {
			this.current_mode = this.current_mode == 'hex' ? 'rgb' : 'hex';
			this.elem_inputWrap.innerHTML = this.getInputTpl();
		},
		bindMove: function (elem, fn, bool) {
			var _this = this;

			elem.addEventListener("mousedown", function (e) {
				_this.downX = e.pageX;
				_this.downY = e.pageY;
				bool ? fn.call(_this, _this.downX, _this.downY) : fn.call(_this, elem, _this.downX, _this.downY);

				document.addEventListener("mousemove", mousemove, false);
				function mousemove(e) {
					_this.moveX = e.pageX;
					_this.moveY = e.pageY;
					bool ? fn.call(_this, _this.moveX, _this.moveY) : fn.call(_this, elem, _this.moveX, _this.moveY);
					e.preventDefault();
				}
				document.addEventListener("mouseup", mouseup, false);
				function mouseup(e) {

					document.removeEventListener("mousemove", mousemove, false)
					document.removeEventListener("mouseup", mouseup, false)
				}
			}, false);
		},
		show: function () {
			util.css(this.elem_wrap, {
				"display": "block"
			})
		},
		hide: function () {
			util.css(this.elem_wrap, {
				"display": "none"
			})
		},
		HSBToRGB: function (hsb) {
			var rgb = {};
			var h = Math.round(hsb.h);
			var s = Math.round(hsb.s * 255 / 100);
			var v = Math.round(hsb.b * 255 / 100);

			if (s == 0) {
				rgb.r = rgb.g = rgb.b = v;
			} else {
				var t1 = v;
				var t2 = (255 - s) * v / 255;
				var t3 = (t1 - t2) * (h % 60) / 60;

				if (h == 360) h = 0;

				if (h < 60) { rgb.r = t1; rgb.b = t2; rgb.g = t2 + t3 }
				else if (h < 120) { rgb.g = t1; rgb.b = t2; rgb.r = t1 - t3 }
				else if (h < 180) { rgb.g = t1; rgb.r = t2; rgb.b = t2 + t3 }
				else if (h < 240) { rgb.b = t1; rgb.r = t2; rgb.g = t1 - t3 }
				else if (h < 300) { rgb.b = t1; rgb.g = t2; rgb.r = t2 + t3 }
				else if (h < 360) { rgb.r = t1; rgb.g = t2; rgb.b = t1 - t3 }
				else { rgb.r = 0; rgb.g = 0; rgb.b = 0 }
			}

			return { r: Math.round(rgb.r), g: Math.round(rgb.g), b: Math.round(rgb.b) };
		},
		rgbToHex: function (rgb) {
			var hex = [
				rgb.r.toString(16),
				rgb.g.toString(16),
				rgb.b.toString(16)
			];
			hex.map(function (str, i) {
				if (str.length == 1) {
					hex[i] = '0' + str;
				}
			});

			return hex.join('');
		},
		hexToRgb: function (hex) {
			var hex = parseInt(((hex.indexOf('#') > -1) ? hex.substring(1) : hex), 16);
			return { r: hex >> 16, g: (hex & 0x00FF00) >> 8, b: (hex & 0x0000FF) };
		},
		hexToHsb: function (hex) {
			return this.rgbToHsb(this.hexToRgb(hex));
		},
		rgbToHsb: function (rgb) {
			var hsb = { h: 0, s: 0, b: 0 };
			var min = Math.min(rgb.r, rgb.g, rgb.b);
			var max = Math.max(rgb.r, rgb.g, rgb.b);
			var delta = max - min;
			hsb.b = max;
			hsb.s = max != 0 ? 255 * delta / max : 0;
			if (hsb.s != 0) {
				if (rgb.r == max) hsb.h = (rgb.g - rgb.b) / delta;
				else if (rgb.g == max) hsb.h = 2 + (rgb.b - rgb.r) / delta;
				else hsb.h = 4 + (rgb.r - rgb.g) / delta;
			} else hsb.h = -1;
			hsb.h *= 60;
			if (hsb.h < 0) hsb.h += 360;
			hsb.s *= 100 / 255;
			hsb.b *= 100 / 255;
			return hsb;
		}
	}

	Colorpicker.create = function (opt) {
		return new Colorpicker(opt)
	}

	window.Colorpicker = Colorpicker;
})()
function backgroundSet (hex){
	if ($(this).prop("checked")) {
		renderer.useBackgroundColor = false;
		renderer.needsUpdate = true;
		$("#backgroudimage").show();
	} else {
		renderer.useBackgroundColor = true;
		renderer.backgroundColor.set(hex);
		renderer.updateBackgroundColor();
		renderer.needsUpdate = true;
		scene.background =null;
		$("#backgroudimage").hide();
	}
}
$("#download").click(function(){
	shot= true;
});
$("#checkbackground").click(backgroundSet);
$("#envMapIntensity").on('input propertychange', () => {
	renderer.envMapIntensity = $( "#envMapIntensity" ).val();
	renderer.needsUpdate = true;
});
Colorpicker.create({
	el: "color-picker",
	color: "#ffffff",
	change: function (elem, hex) {
		$("#color-picker").children().children().css('fill', hex);
		$("#checkbackground").prop("checked",false);
		backgroundSet(hex);
		
	}
})

