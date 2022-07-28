import * as THREE from 'three';
import { RGBELoader } from '../common/RGBELoader';
import { GLTFLoader } from '../common/GLTFLoader';
import { DRACOLoader } from '../common/DRACOLoader';
import { RectAreaLight, QuadLight, DirectionalLight, SphereAreaLight, PointLight } from './lglTracer.es';

function computeBoundingBoxFromModel(model) {
	const bounds = new THREE.Box3();
	bounds.setFromObject(model);
	return bounds;
}

function updateCameraFromModel(camera, controls, model) {
	const bounds = computeBoundingBoxFromModel(model);
	const centroid = new THREE.Vector3();
	bounds.getCenter(centroid);

	const distance = bounds.min.distanceTo(bounds.max);

	camera.position.set(0, (bounds.max.y - bounds.min.y) * 0.5, distance * 1);
	camera.aperture = 0.01 * distance;

	controls.target.copy(centroid);
	controls.update();
}

function getURLFilterManager(baseURL, rootPath, assetMap) {
	const manager = new THREE.LoadingManager();
	// Intercept and override relative URLs.
	manager.setURLModifier((url, path) => {
		const normalizedURL = rootPath + url.replace(baseURL, '').replace(/^(\.?\/)/, '');
		if (assetMap && assetMap.has(normalizedURL)) {
			const blob = assetMap.get(normalizedURL);
			const blobURL = URL.createObjectURL(blob);
			return blobURL;
		}
		return (path || '') + url;
	});
	return manager;
}

function loadGLTF(url) {
	return new Promise((resolve, reject) => {
		const loader = new GLTFLoader();
		loader.load(
			url,
			gltf => {
				resolve(gltf);
			},
			undefined,
			reject
		);
	});
}

function loadDracoGLTF(url) {
	return new Promise((resolve, reject) => {
		const loader = new GLTFLoader();
		loader.setDRACOLoader( new DRACOLoader().setDecoderPath( '/draco/gltf/' ) );
		loader.setCrossOrigin('anonymous');
		loader.load(
			url,
			gltf => {
				resolve(gltf);
			},
			undefined,
			reject
		);
	});
}

function loadLocalGLTF(url, rootPath, assetMap) {
	const baseURL = THREE.LoaderUtils.extractUrlBase(url);
	return new Promise((resolve, reject) => {
		const manager = getURLFilterManager(baseURL, rootPath, assetMap);
		const loader = new GLTFLoader(manager);
		loader.setDRACOLoader( new DRACOLoader().setDecoderPath( '/draco/gltf/' ) );
		loader.setCrossOrigin('anonymous');
		loader.load(
			url,
			gltf => {
				resolve(gltf);
			},
			undefined,
			reject
		);
	});
}

function importGLTF(fileMap) {
	let rootFile, rootPath;
	Array.from(fileMap).forEach(([path, file]) => {
		if (file.name.match(/\.(gltf|glb)$/)) {
			rootFile = file;
			rootPath = path.replace(file.name, '');
		}
	});
	if (!rootFile) {
		console.error('No .gltf or .glb asset found.');
	}
	const fileURL = typeof rootFile === 'string' ? rootFile : URL.createObjectURL(rootFile);
	return loadLocalGLTF(fileURL, rootPath, fileMap);
}

function loadLocalHDR(url, rootPath) {
	const baseURL = THREE.LoaderUtils.extractUrlBase(url);
	return new Promise((resolve, reject) => {
		const manager = getURLFilterManager(baseURL, rootPath);
		const loader = new RGBELoader(manager).setDataType(THREE.FloatType);
		loader.load(
			url,
			envMap => {
				resolve(envMap);
			},
			undefined,
			reject
		);
	});
}

function importHDR(fileMap) {
	let rootFile, rootPath;
	Array.from(fileMap).forEach(([path, file]) => {
		if (file.name.match(/\.(hdr)$/)) {
			rootFile = file;
			rootPath = path.replace(file.name, '');
		}
	});
	if (!rootFile) {
		console.error('No .hdr asset found.');
	}
	const fileURL = typeof rootFile === 'string' ? rootFile : URL.createObjectURL(rootFile);
	return loadLocalHDR(fileURL, rootPath);
}

function loadLightConfig(config, scene) {
	if (!config || config.length == 0) return;
	config.forEach(lightInfo => {
		switch (lightInfo.type) {
			case 'PointLight':
				const pointLight = new PointLight(new THREE.Color().fromArray(lightInfo.emission), 1);
				pointLight.position.fromArray(lightInfo.position);
				scene.add(pointLight);
				break;
			case 'QuadLight':
				const quadLight = new QuadLight(new THREE.Color().fromArray(lightInfo.emission), 1, new THREE.Vector3().fromArray(lightInfo.v1), new THREE.Vector3().fromArray(lightInfo.v2));
                quadLight.position.fromArray(lightInfo.position);
				if(lightInfo.visible != undefined) quadLight.visible = lightInfo.visible;
                scene.add(quadLight);
				break;
            case 'RectAreaLight':
                const rectAreaLight = new RectAreaLight(new THREE.Color().fromArray(lightInfo.emission), 1, lightInfo.width, lightInfo.height);
                rectAreaLight.position.fromArray(lightInfo.position);
                if(lightInfo.target) rectAreaLight.target.fromArray(lightInfo.target);
				if(lightInfo.visible != undefined) rectAreaLight.visible = lightInfo.visible;
                scene.add(rectAreaLight);
                break;
			case 'SphereAreaLight':
				const sphereAreaLight = new SphereAreaLight(new THREE.Color().fromArray(lightInfo.emission), 1, lightInfo.radius);
				sphereAreaLight.position.fromArray(lightInfo.position);
				if(lightInfo.visible != undefined) sphereAreaLight.visible = lightInfo.visible;
				scene.add(sphereAreaLight);
				break;
			case 'DirectionalLight':
				const directionalLight = new DirectionalLight(new THREE.Color().fromArray(lightInfo.emission), 1);
				directionalLight.position.fromArray(lightInfo.position);
                if(lightInfo.target) directionalLight.target.fromArray(lightInfo.target);
				scene.add(directionalLight);
				break;
			default:
				console.warn(`No support light type: ${lightInfo.type}`);
				break;
		}
	})
}

function getLocalStorage(key) {
	if (window.localStorage[key] == 'undefined') {
		return null;
	} else {
		return JSON.parse(localStorage.getItem(key));
	}
}

function setLocalStorage(key, data) {
	return localStorage.setItem(key, JSON.stringify(data));
}

export { updateCameraFromModel, loadGLTF, loadDracoGLTF, importGLTF, importHDR, loadLightConfig, getLocalStorage, setLocalStorage };
