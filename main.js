// --- Импорты --- 
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
// --- Новые импорты для толстых линий ---
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { Line2 } from 'three/addons/lines/Line2.js';
// ---------------------------------------

try {
    // Проверка на THREE теперь не нужна так как импорт обязателен

    // --- Основные настройки сцены --- 
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        alpha: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.body.appendChild(renderer.domElement);
    camera.position.z = 10; // Вернули камеру ближе

    // --- Пост-обработка: Настройка EffectComposer и Bloom --- 
    const renderScene = new RenderPass( scene, camera );
    const bloomPass = new UnrealBloomPass( new THREE.Vector2( window.innerWidth, window.innerHeight ), 1.0, 0.5, 0.85 ); 
    // --- Параметры Bloom - Вернем к менее агрессивным, будем настраивать позже ---
    bloomPass.threshold = 0.85; // Повышаем порог, чтобы менее яркие части не светились
    bloomPass.strength = 0.5;  // Уменьшаем общую силу свечения
    bloomPass.radius = 0.5;    // Радиус пока оставим
    // -----------------------------------------------------------

    const composer = new EffectComposer( renderer );
    composer.addPass( renderScene );
    composer.addPass( bloomPass );
    // -----------------------------------------------------------

    // --- Материалы и параметры объекта ---
    // Убираем старый LineBasicMaterial (уже удалено)

    // --- Новый LineMaterial для толстых линий --- 
    const lineMaterial = new LineMaterial({ 
        color: 0x888888,       // Делаем цвет линий еще темнее
        linewidth: 2.5,         // Задаем толщину линии в пикселях
        transparent: true,     // Включаем прозрачность
        opacity: 0.5,          // Возвращаем полупрозрачность
        resolution: new THREE.Vector2(window.innerWidth, window.innerHeight) // Устанавливаем разрешение
        // dashed: false, // Можно делать пунктирные линии, если нужно
        // alphaToCoverage: true, // Может улучшить сглаживание на некоторых системах
    });
    // -------------------------------------------

    // --- Создание ОДНОГО объекта: Сферы (с новыми линиями) --- 
    const sphereLinesGroup = new THREE.Group();
    const sphereRadius = 5.7; 
    const parallels = 30; 
    const meridians = 60; 

    // --- Создание параллелей с LineGeometry и Line2 ---
    for (let j = 1; j < parallels; j++) {
        const lat = Math.PI * (-0.5 + j / parallels);
        const r = sphereRadius * Math.cos(lat);
        const y = sphereRadius * Math.sin(lat);
        const points = []; 
        const segments = 64;
        for (let i = 0; i <= segments; i++) { 
            const theta = (i / segments) * Math.PI * 2; 
            points.push(Math.cos(theta) * r, y, Math.sin(theta) * r); // Собираем x, y, z подряд
        }
        const geometry = new LineGeometry();
        geometry.setPositions(points);
        const line = new Line2(geometry, lineMaterial);
        line.computeLineDistances(); // Важно для LineMaterial
        sphereLinesGroup.add(line);
    }
    // ----------------------------------------------------

    // --- Создание меридианов с LineGeometry и Line2 ---
    const pointsSphere = []; 
    const segmentsSphere = 64;
    for (let i = 0; i <= segmentsSphere; i++) { 
        const theta = (i / segmentsSphere) * Math.PI * 2; 
        // Создаем точки для одного меридиана (окружность в плоскости XY)
        pointsSphere.push(Math.cos(theta) * sphereRadius, Math.sin(theta) * sphereRadius, 0); 
    }
    const meridianGeometry = new LineGeometry();
    meridianGeometry.setPositions(pointsSphere);

    for (let i = 0; i < meridians; i++) { 
        const meridian = new Line2(meridianGeometry, lineMaterial);
        meridian.computeLineDistances(); // Важно для LineMaterial
        meridian.rotation.y = (Math.PI * 2 * i) / meridians;
        sphereLinesGroup.add(meridian); 
    }
    // ----------------------------------------------------
    
    // --- Внутренняя "туманная" сфера (остается как есть) ---
    const innerFogGeometry = new THREE.SphereGeometry(sphereRadius * 0.98, 32, 32); 
    const innerFogMaterial = new THREE.MeshBasicMaterial({
        color: 0x000000,      
        transparent: true,
        opacity: 0.95, // Высокая непрозрачность для скрытия задних линий
        depthWrite: false,    
        blending: THREE.NormalBlending
    });
    const innerFogSphere = new THREE.Mesh(innerFogGeometry, innerFogMaterial);
    sphereLinesGroup.add(innerFogSphere); 
    // ------------------------------------------

    scene.add(sphereLinesGroup); 

    // --- Освещение --- 
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); 
    scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0xffffff, 1.0);
    pointLight.position.set(0, 10, 15); 
    scene.add(pointLight);

    // --- Переменные для взаимодействия --- 
    let mouseX = 0;
    let isDragging = false;
    let rotationDirection = 1; 
    const constantSpeed = 0.0015;
    let startX = 0;
    let startRotationY = 0;
    const dragSensitivity = 0.002; 
    let targetScale = 1.0;
    let currentScale = 1.0;
    const scaleFactorOnInteract = 1.05; 
    const scaleInterpolationFactor = 0.05;
    // Переменные для инерции и смешивания
    let previousDragRotationY = 0; 
    let currentRotationSpeed = constantSpeed * rotationDirection; // Текущая скорость (начинаем с постоянной)
    const inertiaFactor = 0.05; // Коэффициент для плавного перехода/затухания

    // --- Обработчики событий --- 
    function updateMouseX(clientX) {
        mouseX = (clientX / window.innerWidth) * 2 - 1;
    }

    // --- Добавляем ссылку на элемент плеера для проверки --- 
    const musicPlayerElement = document.getElementById('music-player');
    // -----------------------------------------------------

    document.addEventListener('mousemove', (event) => {
        updateMouseX(event.clientX); 
        if (isDragging) { 
            const currentX = event.clientX;
            const deltaX = currentX - startX;
            const targetRotationY = startRotationY + deltaX * dragSensitivity;
            // Запоминаем угол ПЕРЕД изменением
            previousDragRotationY = sphereLinesGroup.rotation.y;
            sphereLinesGroup.rotation.y = targetRotationY;
        }
    });

    document.addEventListener('touchmove', (event) => {
        updateMouseX(event.touches[0].clientX); 
        if (isDragging) { 
            event.preventDefault();
            const currentX = event.touches[0].clientX;
            const deltaX = currentX - startX;
            const targetRotationY = startRotationY + deltaX * dragSensitivity;
            // Запоминаем угол ПЕРЕД изменением
            previousDragRotationY = sphereLinesGroup.rotation.y;
            sphereLinesGroup.rotation.y = targetRotationY;
        }
    }, { passive: false });

    document.addEventListener('mousedown', (event) => {
        // --- Проверка: игнорируем клики внутри плеера --- 
        if (musicPlayerElement && musicPlayerElement.contains(event.target)) {
            return; 
        }
        // ---------------------------------------------
        isDragging = true;
        startX = event.clientX;
        startRotationY = sphereLinesGroup.rotation.y; 
        updateMouseX(event.clientX);
        targetScale = scaleFactorOnInteract; 
        currentRotationSpeed = 0; 
        previousDragRotationY = sphereLinesGroup.rotation.y; 
    });
    
    document.addEventListener('mouseup', () => {
        // Не нужно проверять здесь, так как isDragging не будет true, если mousedown был на плеере
        if (!isDragging) return;
        isDragging = false;
        targetScale = 1.0; 
        currentRotationSpeed = sphereLinesGroup.rotation.y - previousDragRotationY;
        currentRotationSpeed = Math.max(-0.05, Math.min(0.05, currentRotationSpeed)); 
        if (mouseX > 0.1) { rotationDirection = 1; } 
        else if (mouseX < -0.1) { rotationDirection = -1; }
    });
    
    document.addEventListener('touchstart', (event) => {
         // --- Проверка: игнорируем касания внутри плеера --- 
        if (musicPlayerElement && musicPlayerElement.contains(event.target)) {
            return; 
        }
        // ----------------------------------------------
        isDragging = true;
        startX = event.touches[0].clientX;
        startRotationY = sphereLinesGroup.rotation.y; 
        updateMouseX(event.touches[0].clientX);
        targetScale = scaleFactorOnInteract; 
        currentRotationSpeed = 0; 
        previousDragRotationY = sphereLinesGroup.rotation.y; 
    }, { passive: true }); 
    
    document.addEventListener('touchend', () => {
         // Не нужно проверять здесь
        if (!isDragging) return;
        isDragging = false;
        targetScale = 1.0; 
        currentRotationSpeed = sphereLinesGroup.rotation.y - previousDragRotationY;
        currentRotationSpeed = Math.max(-0.05, Math.min(0.05, currentRotationSpeed)); 
        if (mouseX > 0.1) { rotationDirection = 1; } 
        else if (mouseX < -0.1) { rotationDirection = -1; }
    });

    // --- Окно ресайз --- 
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        // Обновляем размер composer и bloomPass
        composer.setSize(window.innerWidth, window.innerHeight);
        bloomPass.resolution.set(window.innerWidth, window.innerHeight);
        // --- Обновляем разрешение для LineMaterial --- 
        lineMaterial.resolution.set(window.innerWidth, window.innerHeight);
        // ------------------------------------------
    });

    // --- Цикл анимации --- 
    function animate() {
        requestAnimationFrame(animate);

        // Анимация для ЕДИНСТВЕННОГО объекта (сферы)
        
        // Масштабирование
        currentScale += (targetScale - currentScale) * scaleInterpolationFactor;
        sphereLinesGroup.scale.set(currentScale, currentScale, currentScale);

        // Вращение
        if (isDragging) {
            // Во время перетаскивания вращение управляется в mousemove/touchmove
            // currentRotationSpeed остается 0
        } else {
            // Плавно смешиваем текущую скорость (которая может быть инерционной)
            // с целевой постоянной скоростью
            const targetConstantSpeed = constantSpeed * rotationDirection;
            currentRotationSpeed += (targetConstantSpeed - currentRotationSpeed) * inertiaFactor;
            
            // Применяем вращение с текущей скоростью
            sphereLinesGroup.rotation.y += currentRotationSpeed;
        }
        
        // Сброс другого вращения
        sphereLinesGroup.rotation.x = 0;
        sphereLinesGroup.rotation.z = 0;
        
        // Используем composer для рендеринга с эффектами
        // renderer.render(scene, camera); // Заменяем эту строку
        composer.render(); 
    }

    animate();

    // ====================================================
    // ========== КОД МУЗЫКАЛЬНОГО ПЛЕЕРА ============ 
    // ====================================================

    const audioPlayer = new Audio();
    let playlistData = []; // Массив объектов { name: string, url: string, file: File | null }
    let currentTrackIndex = -1;
    let isAudioPlaying = false;
    let isSeekingProgress = false; // Флаг для отложенной перемотки прогресса
    let seekTargetTime = 0;      // Целевое время для отложенной перемотки
    let isSeekingVolume = false; // Флаг для перемотки громкости
    const maxVolumeFactor = 0.25; // Не трогаем максимальную громкость
    const playerState = {
        isShuffle: false,
        isLoopingTrack: false
    };

    // --- Предопределенный список треков --- 
    // Используйте ОТНОСИТЕЛЬНЫЕ пути (если файлы в папке 'audio' рядом с index.html)
    const predefinedTracks = [
        { name: "A$AP Rocky - LVL", url: "audio/A$AP Rocky - LVL.mp3" }, 
        { name: "eyes don't lie - insomnia", url: "audio/eyes don't lie - insomnia.mp3" },
        { name: "Lil B - Im a Leader", url: "audio/Lil B - Im a Leader.mp3" },
        { name: "Serial Experiments Lain - opening", url: "audio/Serial Experiments Lain - opening.mp3" },
        { name: "swerd, jdmfessh - august 11", url: "audio/swerd, jdmfessh - august 11.mp3" },
        { name: "w1tu - Too Good for Me", url: "audio/w1tu - Too Good for Me.mp3" },
    ];
    // -------------------------------------

    // --- Элементы UI плеера --- 
    const playerElement = document.getElementById('music-player');
    const trackInfoElement = document.getElementById('track-info');
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const timeDisplayElement = document.getElementById('time-display');
    const prevButton = document.getElementById('prev-button');
    const playPauseButton = document.getElementById('play-pause-button');
    const nextButton = document.getElementById('next-button');
    const volumeContainer = document.getElementById('volume-container');
    const volumeBar = document.getElementById('volume-bar');
    const addTrackButton = document.getElementById('add-track-button');
    const addTrackInput = document.getElementById('add-track-input');
    const playlistElement = document.getElementById('playlist');
    const shuffleButton = document.getElementById('shuffle-button');
    const loopButton = document.getElementById('loop-button');
    const playlistContainer = document.getElementById('playlist-container'); // Контейнер плейлиста
    const playlistToggleButton = document.getElementById('playlist-toggle-button'); // Кнопка-стрелка

    // --- Функции localStorage (если понадобится сохранение) --- 
    function savePlaylistToStorage() {
         // Если сохранять пользовательские треки не нужно, эту функцию можно удалить
         console.log("Saving custom tracks (if any) is currently disabled.") 
    }

    // --- ФУНКЦИЯ ЗАГРУЗКИ ПРЕДОПРЕДЕЛЕННЫХ ТРЕКОВ --- 
    function loadInitialPlaylist() {
        console.log("Loading predefined tracks...");
        playlistData = predefinedTracks.map(track => ({ 
            name: track.name, 
            url: track.url, 
            file: null // Предопределенные треки не имеют File объекта
        }));
        renderPlaylist(); 
        if (playlistData.length > 0) {
            loadTrack(0); 
        } else {
            disableControls();
        }
        console.log("Predefined tracks loaded.");
    }
    // --------------------------------------

    // --- Функции UI --- 
    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
    }

    function updateProgress() {
        if (isSeekingProgress) return; // Не обновляем во время перемотки
        if (!audioPlayer.duration || isNaN(audioPlayer.duration)) {
            progressBar.style.width = '0%';
            timeDisplayElement.textContent = '0:00 / 0:00';
            return; 
        }
        const progress = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        progressBar.style.width = `${progress}%`;
        timeDisplayElement.textContent = `${formatTime(audioPlayer.currentTime)} / ${formatTime(audioPlayer.duration)}`;
    }

    function updateTrackInfo() {
        if (currentTrackIndex !== -1 && playlistData[currentTrackIndex]) {
            trackInfoElement.textContent = playlistData[currentTrackIndex].name;
            trackInfoElement.title = playlistData[currentTrackIndex].name; // Tooltip для длинных имен
        } else {
            trackInfoElement.textContent = 'No track loaded';
            trackInfoElement.title = '';
        }
        // Обновляем подсветку в плейлисте
        renderPlaylist();
    }
    
    function renderPlaylist() {
        playlistElement.innerHTML = ''; // Очищаем список
        playlistData.forEach((track, index) => {
            const li = document.createElement('li');
            li.textContent = track.name;
            li.dataset.index = index; // Сохраняем индекс для клика
            if (index === currentTrackIndex) {
                li.classList.add('playing');
            }
            playlistElement.appendChild(li);
        });
    }

    function enableControls() {
         playPauseButton.disabled = false;
         prevButton.disabled = playlistData.length <= 1; // Блокируем если 1 трек
         nextButton.disabled = playlistData.length <= 1; // Блокируем если 1 трек
    }

    function disableControls() {
        playPauseButton.disabled = true;
        prevButton.disabled = true;
        nextButton.disabled = true;
    }

    // --- Функции управления воспроизведением --- 
    function loadTrack(index, shouldPlay = false) {
        if (index < 0 || index >= playlistData.length) {
            console.error("Invalid track index");
            currentTrackIndex = -1;
            if (audioPlayer) audioPlayer.src = ''; // Check if audioPlayer exists
            updateTrackInfo();
            updateProgress();
            disableControls();
            return;
        }

        currentTrackIndex = index;
        const track = playlistData[currentTrackIndex];
        
        // Revoke previous object URL if it exists and belongs to a file
        const currentSrc = audioPlayer.src;
        if (currentSrc && currentSrc.startsWith('blob:') && playlistData.some(p => p.url === currentSrc && p.file)) {
            URL.revokeObjectURL(currentSrc);
        }

        // Используем URL напрямую (для предопределенных или уже созданных из файла)
        if (track.url) {
            audioPlayer.src = track.url;
            updateTrackInfo();
            enableControls();

            // If playback is desired, wait for canplay then call playAudio
            if (shouldPlay) {
                // Define the named function for the listener
                const playWhenReady = () => {
                    console.log("'canplay' event received after loadTrack, attempting to play...");
                    playAudio();
                };
                // Remove previous listener just in case (using the named function)
                audioPlayer.removeEventListener('canplay', playWhenReady);
                // Add a one-time listener
                audioPlayer.addEventListener('canplay', playWhenReady, { once: true });
            }

        } else {
             console.warn(`Track "${track.name}" has no URL. Needs user selection.`);
             trackInfoElement.textContent = `Select file for: ${track.name}`;
             audioPlayer.src = '';
             disableControls();
             updateProgress();
             renderPlaylist();
             return; 
        }
    }

    function playAudio() {
        if (currentTrackIndex === -1 && playlistData.length > 0) {
            loadTrack(0, true); // Load and play the first track if nothing is selected
        }
        // Only check src and readyState now
        if (audioPlayer.src && audioPlayer.readyState >= 2) { // >= HAVE_CURRENT_DATA
             audioPlayer.play().then(() => {
                isAudioPlaying = true;
                playPauseButton.textContent = 'Pause';
            }).catch(error => {
                console.error("Error playing audio:", error);
                trackInfoElement.textContent = "Playback error. Check console or try again.";
                // Сбрасываем состояние кнопки, если воспроизведение не удалось
                if (!audioPlayer.paused) {
                    pauseAudio(); 
                }
            });
        } else if (audioPlayer.src) {
             // Audio source is set, but not ready. 
             // The 'canplay' listener attached in loadTrack will handle playback.
             console.log("Audio source set, but not ready yet. Waiting for 'canplay' triggered by loadTrack.");
        } else if (playlistData.length > 0) {
            // Attempt to load the current (or first) track if src is missing
            console.log("No audio source, attempting to load track...");
            loadTrack(currentTrackIndex === -1 ? 0 : currentTrackIndex, true); // Load and ensure it plays
        }
    }

    function pauseAudio() {
        audioPlayer.pause();
        isAudioPlaying = false;
        playPauseButton.textContent = 'Play';
    }

    // --- Функция Play Next --- 
    function playNext() {
        if (playlistData.length === 0) return;
        let nextIndex;
        if (playerState.isShuffle) { 
            if (playlistData.length === 1) {
                nextIndex = 0; 
            } else {
                do {
                    nextIndex = Math.floor(Math.random() * playlistData.length);
                } while (nextIndex === currentTrackIndex);
            }
        } else {
            nextIndex = (currentTrackIndex + 1) % playlistData.length;
        }
        loadTrack(nextIndex, true); // Load and flag for playback
    }
    // ---------------------------

    // --- Функция Play Prev --- 
    function playPrev() {
        if (playlistData.length === 0) return;
        let prevIndex = (currentTrackIndex - 1 + playlistData.length) % playlistData.length;
        loadTrack(prevIndex, true); // Load and flag for playback
    }

    function setVolume(level) {
        const actualVolume = Math.max(0, Math.min(1, level)) * maxVolumeFactor;
        audioPlayer.volume = actualVolume;
        // Обновление ползунка громкости теперь в событии 'volumechange'
    }

    // --- Функция ВИЗУАЛЬНОЙ перемотки --- 
    function updateSeekVisual(event) {
         if (!audioPlayer.duration || isNaN(audioPlayer.duration)) return;
         const bounds = progressContainer.getBoundingClientRect();
         let x = 0;
         if (event.clientX !== undefined) { 
             x = event.clientX - bounds.left;
         } else if (event.touches && event.touches.length > 0) { 
              x = event.touches[0].clientX - bounds.left;
         } else { return; } 
         const percentage = Math.max(0, Math.min(1, x / bounds.width));
         seekTargetTime = percentage * audioPlayer.duration;
         progressBar.style.width = `${percentage * 100}%`; // Обновляем только ползунок
         // Показываем время перемотки
         timeDisplayElement.textContent = `${formatTime(seekTargetTime)} / ${formatTime(audioPlayer.duration)}`;
    }
    // -----------------------------------------

    // --- Функция перемотки ГРОМКОСТИ --- 
    function seekVolume(event) {
         const bounds = volumeContainer.getBoundingClientRect();
         let x = 0;
         if (event.clientX !== undefined) {
            x = event.clientX - bounds.left;
         } else if (event.touches && event.touches.length > 0) {
             x = event.touches[0].clientX - bounds.left;
         } else { return; } 
         const percentage = Math.max(0, Math.min(1, x / bounds.width));
         setVolume(percentage); 
    }
    // ----------------------------------------

    // --- Обработчики событий плеера --- 
    playPauseButton.addEventListener('click', () => {
        if (!audioPlayer.src && playlistData.length > 0) {
            loadTrack(currentTrackIndex === -1 ? 0 : currentTrackIndex);
            // playAudio будет вызван автоматически после загрузки или при canplay
        } else if (isAudioPlaying) {
            pauseAudio();
        } else {
            playAudio();
        }
    });
    nextButton.addEventListener('click', playNext);
    prevButton.addEventListener('click', playPrev);

    audioPlayer.addEventListener('timeupdate', updateProgress);
    audioPlayer.addEventListener('ended', () => {
        if (playerState.isLoopingTrack) { 
            audioPlayer.currentTime = 0;
            playAudio();
        } else {
            playNext();
        }
    }); 
    audioPlayer.addEventListener('loadedmetadata', updateProgress); // Обновить длительность и прогресс при загрузке метаданных
    audioPlayer.addEventListener('volumechange', () => { 
         // Обновляем ползунок громкости при любом изменении (включая setVolume)
         const displayLevel = maxVolumeFactor > 0 ? Math.min(1, audioPlayer.volume / maxVolumeFactor) : 0;
         volumeBar.style.width = `${displayLevel * 100}%`;
    });
    // Добавим обработку ошибок во время загрузки/воспроизведения
    audioPlayer.addEventListener('error', (e) => {
        console.error("Audio Player Error:", e);
        trackInfoElement.textContent = "Error loading/playing track.";
        disableControls();
        pauseAudio(); // Убедимся, что состояние паузы
        progressBar.style.width = '0%';
        timeDisplayElement.textContent = '0:00 / 0:00';
        // Можно попытаться загрузить следующий трек, если ошибка не критична
        // playNext(); 
    });

    // Обработчики кнопок Shuffle/Loop
    if (shuffleButton) {
        shuffleButton.addEventListener('click', () => {
            playerState.isShuffle = !playerState.isShuffle;
            shuffleButton.classList.toggle('active', playerState.isShuffle);
        });
    } else { console.error("Shuffle button not found!"); }
    if (loopButton) {
        loopButton.addEventListener('click', () => {
            playerState.isLoopingTrack = !playerState.isLoopingTrack;
            loopButton.classList.toggle('active', playerState.isLoopingTrack);
            // Устанавливаем свойство loop у audio элемента для надежности
            audioPlayer.loop = playerState.isLoopingTrack;
        });
    } else { console.error("Loop button not found!"); }

    // --- Обработчики добавления треков, плейлиста, toggle --- 
    addTrackButton.addEventListener('click', () => { addTrackInput.click(); });
    addTrackInput.addEventListener('change', (event) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;
        
        const newTracks = [];
        for (const file of files) {
            // Проверяем, нет ли уже трека с таким именем ИЛИ таким же файлом (если File API используется)
            if (!playlistData.some(track => track.name === file.name || track.file === file)) {
                const objectURL = URL.createObjectURL(file);
                newTracks.push({ 
                    name: file.name, 
                    url: objectURL, // Сразу создаем URL
                    file: file // Сохраняем файл для возможного отзыва URL
                });
            } else {
                console.warn(`Track "${file.name}" already in playlist or file already added.`);
            }
        }

        if (newTracks.length > 0) {
            playlistData.push(...newTracks);
            renderPlaylist();
            savePlaylistToStorage(); // Вызов функции сохранения (сейчас пустая)
            if (currentTrackIndex === -1) { // Если это первые треки
                loadTrack(playlistData.length - newTracks.length); // Загружаем первый из добавленных
            } 
            enableControls(); // Обновляем доступность кнопок prev/next
        }
        addTrackInput.value = ''; // Сбрасываем input
    });
    playlistElement.addEventListener('click', (event) => {
        if (event.target && event.target.tagName === 'LI') {
            const index = parseInt(event.target.dataset.index, 10);
            if (!isNaN(index)) {
                if (index !== currentTrackIndex) {
                     loadTrack(index, true); 
                } else if (!isAudioPlaying) {
                    playAudio();
                } 
            }
        }
    });
    playlistToggleButton.addEventListener('click', () => { 
        playlistContainer.classList.toggle('playlist-visible'); 
        // Меняем title кнопки для доступности
        const isVisible = playlistContainer.classList.contains('playlist-visible');
        playlistToggleButton.title = isVisible ? 'Hide Playlist' : 'Show Playlist';
    });
    
    // === ОБРАБОТЧИКИ ПРОГРЕССА (Deferred Seek) ===
    const startProgressListener = (initialEvent) => {
        if (!audioPlayer.duration || isNaN(audioPlayer.duration)) return;
        if (initialEvent.type === 'touchstart') initialEvent.preventDefault();
        isSeekingProgress = true;
        updateSeekVisual(initialEvent); // Показать начальное положение

        const moveHandler = (moveEvent) => { 
            if (moveEvent.type === 'touchmove') moveEvent.preventDefault();
            updateSeekVisual(moveEvent);
        };
        const endHandler = () => {
            if (isSeekingProgress) {
                audioPlayer.currentTime = seekTargetTime;
                isSeekingProgress = false;
                // После установки времени, timeupdate обновит дисплей
            }
            document.removeEventListener('mousemove', moveHandler);
            document.removeEventListener('mouseup', endHandler);
            document.removeEventListener('touchmove', moveHandler);
            document.removeEventListener('touchend', endHandler);
        };

        // Добавляем слушатели на document для отслеживания движения вне элемента
        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('mouseup', endHandler);
        document.addEventListener('touchmove', moveHandler, { passive: false });
        document.addEventListener('touchend', endHandler);
    };
    progressContainer.addEventListener('mousedown', startProgressListener);
    progressContainer.addEventListener('touchstart', startProgressListener, { passive: false });
    // ==========================================================

    // === ОБРАБОТЧИКИ ГРОМКОСТИ (Мгновенные) ===
     const startVolumeListener = (initialEvent) => {
         if (initialEvent.type === 'touchstart') initialEvent.preventDefault();
         isSeekingVolume = true;
         seekVolume(initialEvent);
         
         const moveHandler = (moveEvent) => { 
             if (moveEvent.type === 'touchmove') moveEvent.preventDefault(); 
             if (isSeekingVolume) { 
                  seekVolume(moveEvent);
             }
         };
         const endHandler = () => {
             isSeekingVolume = false;
             document.removeEventListener('mousemove', moveHandler);
             document.removeEventListener('mouseup', endHandler);
             document.removeEventListener('touchmove', moveHandler);
             document.removeEventListener('touchend', endHandler);
         };

         // Добавляем слушатели на document
         document.addEventListener('mousemove', moveHandler);
         document.addEventListener('mouseup', endHandler);
         document.addEventListener('touchmove', moveHandler, { passive: false });
         document.addEventListener('touchend', endHandler);
     };
    volumeContainer.addEventListener('mousedown', startVolumeListener);
    volumeContainer.addEventListener('touchstart', startVolumeListener, { passive: false });
    // ============================================================

    // --- Инициализация плеера --- 
    setVolume(0.3); // Установить начальную громкость (ползунок обновится через volumechange)
    loadInitialPlaylist(); // Загрузить предопределенные треки
    
    // ====================================================
    // ======= КОНЕЦ КОДА МУЗЫКАЛЬНОГО ПЛЕЕРА ========
    // ====================================================

} catch (error) {
     const errorElement = document.getElementById('error-message');
     // Добавим проверку, существует ли errorElement
     if (errorElement) {
         errorElement.textContent = 'Error: ' + error.message;
     } else {
         console.error('Error message element not found!');
     }
     console.error('Initialization Error:', error);
 } 