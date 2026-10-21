/*! Knowledge atlas for the docs homepage.
 *  Three.js is loaded on demand under the MIT license:
 *  https://github.com/mrdoob/three.js
 */
(() => {
  "use strict";

  const STAGE_SELECTOR = "[data-kb-atlas]";
  const GRAPH_KEY = "__KB_ATLAS_GRAPH__";
  const THREE_SOURCES = [
    "https://fastly.jsdelivr.net/npm/three@0.180.0/build/three.module.min.js",
    "https://gcore.jsdelivr.net/npm/three@0.180.0/build/three.module.min.js",
    "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.min.js",
    "https://unpkg.com/three@0.180.0/build/three.module.min.js",
    "https://esm.sh/three@0.180.0"
  ];

  const instances = new Map();
  let bootScheduled = false;
  let dataScheduled = false;
  let dataRetries = 0;
  let visibilityObserver = null;

  const loadThree = async () => {
    let lastError = null;
    for (const url of THREE_SOURCES) {
      try {
        return await import(/* webpackIgnore: true */ url);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError ?? new Error("Three.js could not be loaded");
  };

  const showFallback = (stage) => {
    stage.classList.remove("is-ready");
    stage.classList.add("is-fallback");
  };

  async function initAtlas(stage, graph) {
    if (!graph || !Array.isArray(graph.subjects) || graph.subjects.length === 0) {
      throw new Error("Knowledge graph data is missing");
    }

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const palette = {
      "data-structure": { light: "#b4573a", dark: "#e8a085" },
      "computer-architecture": { light: "#9a7434", dark: "#ddba7f" },
      "linear-algebra": { light: "#5f7f6b", dark: "#aac7b2" },
      "higher-mathematics": { light: "#8d6248", dark: "#d8ab90" },
      "probability-theory": { light: "#94615e", dark: "#dda9a5" }
    };

    const isDark = () => {
      const root = document.documentElement;
      return (
        root.classList.contains("dark") ||
        root.getAttribute("data-theme") === "dark" ||
        root.style.colorScheme === "dark"
      );
    };

    const subjectColor = (key) => {
      const entry = palette[key] ?? palette["data-structure"];
      return entry[isDark() ? "dark" : "light"];
    };

    const pad = (value) => String(value).padStart(2, "0");
    const THREE = await loadThree();

    const makeGlowTexture = () => {
      const glowCanvas = document.createElement("canvas");
      glowCanvas.width = 128;
      glowCanvas.height = 128;
      const context = glowCanvas.getContext("2d");
      const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, "rgba(255, 255, 255, 0.9)");
      gradient.addColorStop(0.35, "rgba(255, 255, 255, 0.34)");
      gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 128, 128);
      const texture = new THREE.CanvasTexture(glowCanvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    };

    const canvas = document.createElement("canvas");
    canvas.className = "kb-atlas__canvas";
    canvas.setAttribute("aria-hidden", "true");
    const labelsLayer = document.createElement("div");
    labelsLayer.className = "kb-atlas__labels";
    stage.prepend(canvas);
    stage.append(labelsLayer);

    const subjectMap = new Map(graph.subjects.map((subject) => [subject.key, subject]));
    const reduceMotion = () => motionQuery.matches;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "low-power"
    });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0, 9.2);

    const group = new THREE.Group();
    scene.add(group);

    // Layout: two columns of subject branches. Every chapter gets a fixed row,
    // so all 24 chapter labels stay readable at once.
    const TOP = 2.35;
    const BOTTOM = -2.35;
    const HEADER_GAP = 0.34;
    const LABEL_PAD = 0.1;
    const MIN_GAP = 0.22;
    const BASE_ROW_STEP = 0.3;
    const CONTENT_WIDTH = 4.8;
    const CONTENT_HEIGHT = TOP - BOTTOM + 0.5;

    const columnLayouts = [
      {
        hubX: -2.2,
        nodeX: -1.6,
        subjects: ["data-structure", "linear-algebra", "higher-mathematics"]
      },
      {
        hubX: 0,
        nodeX: 0.5,
        subjects: ["computer-architecture", "probability-theory"]
      }
    ];

    const availableHeight = TOP - BOTTOM;
    let rowStep = BASE_ROW_STEP;

    columnLayouts.forEach((column) => {
      const clusters = column.subjects.length;
      const chapterCount = column.subjects.reduce(
        (total, key) => total + (subjectMap.get(key)?.chapters.length ?? 0),
        0
      );
      const flexibleRows = Math.max(chapterCount - clusters, 1);
      const fixedSpace =
        clusters * (HEADER_GAP + LABEL_PAD) + Math.max(clusters - 1, 0) * MIN_GAP;
      rowStep = Math.min(rowStep, (availableHeight - fixedSpace) / flexibleRows);
    });
    rowStep = Math.max(0.17, rowStep);

    const subjectEntries = [];
    const chapterEntries = [];

    columnLayouts.forEach((column) => {
      const heights = column.subjects.map((key) => {
        const count = subjectMap.get(key)?.chapters.length ?? 0;
        return HEADER_GAP + Math.max(count - 1, 0) * rowStep + LABEL_PAD;
      });
      const totalHeight = heights.reduce((sum, height) => sum + height, 0);
      const gap =
        column.subjects.length > 1
          ? (availableHeight - totalHeight) / (column.subjects.length - 1)
          : 0;

      let cursorY = TOP;

      column.subjects.forEach((subjectKey, clusterIndex) => {
        const subject = subjectMap.get(subjectKey);
        if (!subject) return;

        const color = subjectColor(subjectKey);
        const subjectLabel = document.createElement("div");
        subjectLabel.className = "kb-atlas__subject";
        subjectLabel.style.setProperty("--subject", color);

        const subjectName = document.createElement("span");
        subjectName.className = "kb-atlas__subject-name";
        subjectName.textContent = subject.name;
        const subjectCount = document.createElement("span");
        subjectCount.className = "kb-atlas__subject-count";
        subjectCount.textContent = `${subject.chapters.length} 章`;
        subjectLabel.append(subjectName, subjectCount);
        labelsLayer.append(subjectLabel);

        const hubPosition = new THREE.Vector3(column.hubX, cursorY, 0);
        const subjectEntry = {
          key: subjectKey,
          subject,
          label: subjectLabel,
          hubPosition,
          color,
          node: null,
          ring: null
        };
        subjectEntries.push(subjectEntry);

        const chapterStartY = cursorY - HEADER_GAP;

        subject.chapters.forEach((chapter, chapterIndex) => {
          const y = chapterStartY - chapterIndex * rowStep;
          const position = new THREE.Vector3(column.nodeX, y, 0);

          const label = document.createElement("a");
          label.className = "kb-atlas__chapter";
          label.href = chapter.path;
          label.tabIndex = -1;
          label.title = `${chapter.title} · ${chapter.points.length} 个知识点`;
          label.style.setProperty("--subject", color);
          const indexEl = document.createElement("span");
          indexEl.className = "kb-atlas__chapter-index";
          indexEl.textContent = pad(chapter.number);
          const nameEl = document.createElement("span");
          nameEl.className = "kb-atlas__chapter-name";
          nameEl.textContent = chapter.shortTitle;
          label.append(indexEl, nameEl);
          labelsLayer.append(label);

          chapterEntries.push({
            subject: subjectEntry,
            chapter,
            position,
            label,
            node: null,
            material: null,
            baseRadius: 0.032 + Math.min(chapter.points.length, 9) * 0.0028,
            scale: 1,
            targetScale: 1,
            opacity: 0.82,
            targetOpacity: 0.82
          });
        });

        cursorY -= heights[clusterIndex] + gap;
      });
    });

    const chapterGeometry = new THREE.SphereGeometry(1, 14, 14);
    const hubGeometry = new THREE.SphereGeometry(1, 20, 20);
    const ringGeometry = new THREE.RingGeometry(0.108, 0.118, 56);
    const ringInnerGeometry = new THREE.RingGeometry(0.15, 0.156, 56);

    chapterEntries.forEach((entry) => {
      const material = new THREE.MeshBasicMaterial({
        color: subjectColor(entry.subject.key),
        transparent: true,
        opacity: 0.82,
        depthWrite: false
      });
      const node = new THREE.Mesh(chapterGeometry, material);
      node.position.copy(entry.position);
      node.scale.setScalar(entry.baseRadius);
      group.add(node);
      entry.node = node;
      entry.material = material;
    });

    subjectEntries.forEach((entry) => {
      const material = new THREE.MeshBasicMaterial({
        color: subjectColor(entry.key),
        transparent: true,
        opacity: 0.94,
        depthWrite: false
      });
      const hub = new THREE.Mesh(hubGeometry, material);
      hub.position.copy(entry.hubPosition);
      hub.scale.setScalar(0.078);
      group.add(hub);
      entry.node = hub;
      entry.material = material;

      const ringMaterial = new THREE.MeshBasicMaterial({
        color: subjectColor(entry.key),
        transparent: true,
        opacity: 0.26,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.position.copy(entry.hubPosition);
      ring.rotation.z = 0.25;
      group.add(ring);
      entry.ring = ring;
    });

    // Connect each subject hub to every chapter and give each cluster a spine.
    const branchPositions = [];
    const branchColors = [];
    const branchKeys = [];
    const spinePositions = [];
    const spineColors = [];
    const spineKeys = [];
    const pointPositions = [];
    const pointColors = [];
    const color = new THREE.Color();
    const random = (seed) => {
      const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
      return value - Math.floor(value);
    };

    const pushSegment = (positions, colors, keys, from, to, hex, subjectKey) => {
      positions.push(from.x, from.y, from.z, to.x, to.y, to.z);
      color.set(hex);
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
      keys.push(subjectKey);
    };

    chapterEntries.forEach((entry, index) => {
      const from = entry.subject.hubPosition;
      const to = entry.position;
      const control = new THREE.Vector3(
        (from.x + to.x) / 2 + (from.x < to.x ? 0.06 : -0.06),
        (from.y + to.y) / 2,
        0.22
      );
      const curve = new THREE.QuadraticBezierCurve3(
        from.clone().add(new THREE.Vector3(from.x < to.x ? 0.05 : -0.05, -0.01, 0)),
        control,
        to
      );
      const points = curve.getPoints(18);
      for (let i = 0; i < points.length - 1; i += 1) {
        pushSegment(
          branchPositions,
          branchColors,
          branchKeys,
          points[i],
          points[i + 1],
          subjectColor(entry.subject.key),
          entry.subject.key
        );
      }

      const next = chapterEntries[index + 1];
      if (next && next.subject === entry.subject) {
        const spineControl = new THREE.Vector3(
          (to.x + next.position.x) / 2 + 0.025,
          (to.y + next.position.y) / 2,
          0.07
        );
        const spineCurve = new THREE.QuadraticBezierCurve3(
          to.clone(),
          spineControl,
          next.position.clone()
        );
        const spinePoints = spineCurve.getPoints(6);
        for (let i = 0; i < spinePoints.length - 1; i += 1) {
          pushSegment(
            spinePositions,
            spineColors,
            spineKeys,
            spinePoints[i],
            spinePoints[i + 1],
            subjectColor(entry.subject.key),
            entry.subject.key
          );
        }
      }

      const pointColor = new THREE.Color(subjectColor(entry.subject.key)).lerp(
        new THREE.Color(0xffffff),
        isDark() ? 0.1 : 0.28
      );
      entry.chapter.points.forEach((point, pointIndex) => {
        const angle =
          (pointIndex / Math.max(entry.chapter.points.length, 1)) * Math.PI * 2 +
          random(index + 1) * 1.4;
        const radius =
          0.085 + (pointIndex % 4) * 0.018 + random(index * 7 + pointIndex) * 0.035;
        pointPositions.push(
          to.x + Math.cos(angle) * radius,
          to.y + Math.sin(angle) * radius * 0.82,
          Math.sin(angle * 1.7 + index) * 0.16
        );
        pointColors.push(pointColor.r, pointColor.g, pointColor.b);
      });
    });

    const makeLine = (positions, colors, keys, opacity) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      const material = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity,
        depthWrite: false
      });
      const lines = new THREE.LineSegments(geometry, material);
      group.add(lines);
      return { lines, geometry, material, keys };
    };

    const branchLines = makeLine(branchPositions, branchColors, branchKeys, 0.15);
    const spineLines = makeLine(spinePositions, spineColors, spineKeys, 0.08);

    const pointGeometry = new THREE.BufferGeometry();
    pointGeometry.setAttribute("position", new THREE.Float32BufferAttribute(pointPositions, 3));
    pointGeometry.setAttribute("color", new THREE.Float32BufferAttribute(pointColors, 3));
    const pointMaterial = new THREE.PointsMaterial({
      size: 0.021,
      vertexColors: true,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      sizeAttenuation: true
    });
    group.add(new THREE.Points(pointGeometry, pointMaterial));

    // Faint ambient rings and dust add depth without competing with the labels.
    const ambientRingMaterial = new THREE.LineBasicMaterial({
      color: subjectColor("data-structure"),
      transparent: true,
      opacity: 0.045,
      depthWrite: false
    });
    const ambientRings = [];
    [3.15, 3.7].forEach((radius, index) => {
      const curve = new THREE.EllipseCurve(0, 0, radius, radius * 0.74, 0, Math.PI * 2);
      const points = curve.getPoints(180).map((point) => new THREE.Vector3(point.x, point.y, 0));
      const ring = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(points),
        ambientRingMaterial
      );
      ring.rotation.x = 1.12 + index * 0.08;
      ring.rotation.z = -0.18 + index * 0.5;
      group.add(ring);
      ambientRings.push(ring);
    });

    let ambientDust = null;
    {
      const dustPositions = [];
      for (let i = 0; i < 70; i += 1) {
        dustPositions.push(
          (random(i * 3 + 1) - 0.5) * 4.9,
          (random(i * 5 + 2) - 0.5) * 4.7,
          -0.7 + random(i * 7 + 3) * 1.1
        );
      }
      const dustGeometry = new THREE.BufferGeometry();
      dustGeometry.setAttribute("position", new THREE.Float32BufferAttribute(dustPositions, 3));
      const dustMaterial = new THREE.PointsMaterial({
        color: subjectColor("data-structure"),
        size: 0.014,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        sizeAttenuation: true
      });
      ambientDust = new THREE.Points(dustGeometry, dustMaterial);
      group.add(ambientDust);
    }

    const glowTexture = makeGlowTexture();
    const activeGlowMaterial = new THREE.SpriteMaterial({
      map: glowTexture,
      color: subjectColor("data-structure"),
      transparent: true,
      opacity: 0.36,
      depthWrite: false
    });
    const activeGlow = new THREE.Sprite(activeGlowMaterial);
    activeGlow.scale.setScalar(0.52);
    group.add(activeGlow);

    const activeRingMaterial = new THREE.MeshBasicMaterial({
      color: subjectColor("data-structure"),
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const activeRing = new THREE.Mesh(ringGeometry, activeRingMaterial);
    group.add(activeRing);

    const activeOuterMaterial = new THREE.MeshBasicMaterial({
      color: subjectColor("data-structure"),
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const activeOuterRing = new THREE.Mesh(ringInnerGeometry, activeOuterMaterial);
    group.add(activeOuterRing);

    const tourOrder = chapterEntries.slice();
    const tourPositionByIndex = new Map(tourOrder.map((entry, index) => [entry, index]));

    let activeEntry = chapterEntries[0];
    let activeTourPosition = 0;
    let paused = false;
    let tourElapsed = 0;
    const TOUR_STEP_MS = 3400;

    const applyActive = (entry, { pausedByUser = false } = {}) => {
      if (!entry) return;
      activeEntry = entry;
      activeTourPosition = tourPositionByIndex.get(entry) ?? 0;
      paused = pausedByUser;
      tourElapsed = 0;

      chapterEntries.forEach((item) => {
        const isActive = item === entry;
        item.targetScale = isActive ? 1.75 : 1;
        item.targetOpacity = isActive ? 1 : 0.8;
        item.label.classList.toggle("is-active", isActive);
      });
      subjectEntries.forEach((item) => {
        item.label.classList.toggle("is-active", item === entry.subject);
      });

      const colorValue = subjectColor(entry.subject.key);
      activeRingMaterial.color.set(colorValue);
      activeOuterMaterial.color.set(colorValue);
      activeGlowMaterial.color.set(colorValue);
      activeGlow.position.copy(entry.position);
      activeRing.position.copy(entry.position);
      activeOuterRing.position.copy(entry.position);
      if (!animating) renderStatic();
    };

    const advanceTour = () => {
      activeTourPosition = (activeTourPosition + 1) % tourOrder.length;
      applyActive(tourOrder[activeTourPosition]);
    };

    chapterEntries.forEach((entry) => {
      const focusEntry = () => applyActive(entry, { pausedByUser: true });
      const releaseEntry = () => {
        if (activeEntry === entry) paused = false;
      };
      entry.label.addEventListener("pointerenter", focusEntry);
      entry.label.addEventListener("pointerleave", releaseEntry);
      entry.label.addEventListener("focus", focusEntry);
      entry.label.addEventListener("blur", releaseEntry);
    });

    const paintTheme = () => {

      chapterEntries.forEach((entry) => {
        const colorValue = subjectColor(entry.subject.key);
        entry.material.color.set(colorValue);
        entry.label.style.setProperty("--subject", colorValue);
      });
      subjectEntries.forEach((entry) => {
        const colorValue = subjectColor(entry.key);
        entry.material.color.set(colorValue);
        entry.label.style.setProperty("--subject", colorValue);
        entry.ring.material.color.set(colorValue);
      });

      ambientRingMaterial.color.set(subjectColor("data-structure"));
      if (ambientDust) ambientDust.material.color.set(subjectColor("data-structure"));

      const colorLines = (target) => {
        const array = target.geometry.attributes.color.array;
        target.keys.forEach((subjectKey, index) => {
          color.set(subjectColor(subjectKey));
          const cursor = index * 6;
          array[cursor] = color.r;
          array[cursor + 1] = color.g;
          array[cursor + 2] = color.b;
          array[cursor + 3] = color.r;
          array[cursor + 4] = color.g;
          array[cursor + 5] = color.b;
        });
        target.geometry.attributes.color.needsUpdate = true;
      };
      colorLines(branchLines);
      colorLines(spineLines);

      const pointArray = pointGeometry.attributes.color.array;
      let pointCursor = 0;
      chapterEntries.forEach((entry) => {
        const pointColor = new THREE.Color(subjectColor(entry.subject.key)).lerp(
          new THREE.Color(0xffffff),
          isDark() ? 0.1 : 0.28
        );
        entry.chapter.points.forEach(() => {
          pointArray[pointCursor] = pointColor.r;
          pointArray[pointCursor + 1] = pointColor.g;
          pointArray[pointCursor + 2] = pointColor.b;
          pointCursor += 3;
        });
      });
      pointGeometry.attributes.color.needsUpdate = true;
      pointMaterial.opacity = isDark() ? 0.56 : 0.52;

      applyActive(activeEntry);
      if (!animating) renderStatic();
    };
    const pointer = new THREE.Vector2();
    const targetPointer = new THREE.Vector2();
    let width = 1;
    let height = 1;
    let baseDistance = 9.2;
    let labelScale = 1;
    let animating = false;
    let animationFrame = 0;
    let lastFrame = performance.now();
    let elapsed = 0;
    let visible = true;
    let disposed = false;

    const measure = () => {
      const rect = stage.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
    };

    const resize = () => {
      measure();
      labelScale = Math.min(1, Math.max(0.84, (width - 24) / 399));
      stage.style.setProperty("--atlas-label-scale", labelScale.toFixed(3));

      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;

      const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2;
      const distanceForHeight = CONTENT_HEIGHT / 2 / Math.tan(halfFov);
      const distanceForWidth = CONTENT_WIDTH / 2 / (Math.tan(halfFov) * camera.aspect);
      baseDistance = Math.max(distanceForHeight, distanceForWidth) * 1.035;
      camera.position.z = baseDistance;
      camera.updateProjectionMatrix();

      updateLabels();
      if (!animating) renderStatic();
    };

    const tmp = new THREE.Vector3();
    const updateLabels = () => {
      group.updateMatrixWorld();
      const offset = 12 * labelScale;
      const place = (label, position, extraX = 0) => {
        tmp.copy(position).applyMatrix4(group.matrixWorld).project(camera);
        const x = (tmp.x * 0.5 + 0.5) * width;
        const y = (-tmp.y * 0.5 + 0.5) * height;
        label.style.transform = `translate3d(${x + offset + extraX}px, ${y}px, 0) translateY(-50%)`;
      };
      subjectEntries.forEach((entry) => place(entry.label, entry.hubPosition));
      chapterEntries.forEach((entry) => place(entry.label, entry.position));
    };

    const renderStatic = () => {
      updateLabels();
      renderer.render(scene, camera);
    };

    function disposeScene() {
      if (disposed) return;
      disposed = true;
      stopAnimation();
      io.disconnect();
      ro.disconnect();
      themeObserver.disconnect();
      stage.removeEventListener("pointermove", onPointerMove);
      stage.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", syncAnimation);
      motionQuery.removeEventListener?.("change", syncAnimation);

      chapterEntries.forEach((entry) => {
        entry.material?.dispose();
        entry.label.remove();
      });
      subjectEntries.forEach((entry) => {
        entry.ring?.material.dispose();
        entry.material?.dispose();
        entry.label.remove();
      });

      chapterGeometry.dispose();
      hubGeometry.dispose();
      ringGeometry.dispose();
      ringInnerGeometry.dispose();
      branchLines.geometry.dispose();
      branchLines.material.dispose();
      spineLines.geometry.dispose();
      spineLines.material.dispose();
      pointGeometry.dispose();
      pointMaterial.dispose();
      ambientRings.forEach((ring) => ring.geometry.dispose());
      ambientRingMaterial.dispose();
      ambientDust.geometry.dispose();
      ambientDust.material.dispose();
      glowTexture.dispose();
      activeGlowMaterial.dispose();
      activeRingMaterial.dispose();
      activeOuterMaterial.dispose();
      renderer.dispose();
      canvas.remove();
      labelsLayer.remove();
      stage.classList.remove("is-ready", "is-fallback");
      delete stage.dataset.kbAtlasMounted;
    }

    const renderFrame = (now) => {
      if (!animating) return;
      if (!stage.isConnected) {
        disposeScene();
        return;
      }

      const delta = Math.min((now - lastFrame) / 1000, 0.05);
      lastFrame = now;
      elapsed += delta;

      if (!paused) {
        tourElapsed += delta * 1000;
        if (tourElapsed >= TOUR_STEP_MS) {
          tourElapsed = 0;
          advanceTour();
        }
      }

      pointer.lerp(targetPointer, Math.min(1, delta * 3.6));
      group.rotation.y = Math.sin(elapsed * 0.16) * 0.028 + pointer.x * 0.018;
      group.rotation.x = Math.sin(elapsed * 0.11) * 0.014 - pointer.y * 0.014;
      group.position.y = Math.sin(elapsed * 0.36) * 0.016;
      camera.position.x = pointer.x * 0.2;
      camera.position.y = -pointer.y * 0.14;
      camera.position.z = baseDistance;
      camera.lookAt(0, 0, 0);

      const pulse = 1 + Math.sin(elapsed * 3.1) * 0.08;
      activeGlow.scale.setScalar(0.52 * pulse);
      activeGlowMaterial.opacity = 0.3 + Math.sin(elapsed * 3.1) * 0.07;
      activeRing.scale.setScalar(1.2 * pulse);
      activeOuterRing.scale.setScalar(1 + Math.sin(elapsed * 2.1) * 0.06);
      activeRingMaterial.opacity = 0.66 + Math.sin(elapsed * 2.6) * 0.12;

      chapterEntries.forEach((entry) => {
        entry.scale += (entry.targetScale - entry.scale) * Math.min(1, delta * 9);
        entry.opacity += (entry.targetOpacity - entry.opacity) * Math.min(1, delta * 9);
        entry.node.scale.setScalar(entry.baseRadius * entry.scale);
        entry.material.opacity = entry.opacity;
      });

      subjectEntries.forEach((entry, index) => {
        const isActiveSubject = entry === activeEntry.subject;
        const target = isActiveSubject ? 1.35 : 1;
        entry.node.scale.x += (0.078 * target - entry.node.scale.x) * Math.min(1, delta * 8);
        entry.node.scale.y = entry.node.scale.x;
        entry.node.scale.z = entry.node.scale.x;
        entry.ring.rotation.z += delta * (index % 2 === 0 ? 0.12 : -0.1);
        entry.ring.material.opacity = isActiveSubject ? 0.42 : 0.24;
      });

      ambientRings.forEach((ring, index) => {
        ring.rotation.z += delta * (index === 0 ? 0.008 : -0.006);
      });

      updateLabels();
      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(renderFrame);
    };

    const stopAnimation = () => {
      animating = false;
      cancelAnimationFrame(animationFrame);
    };

    const syncAnimation = () => {
      if (disposed || !stage.isConnected) return;
      const shouldAnimate = !reduceMotion() && !document.hidden && visible;
      if (!shouldAnimate) {
        stopAnimation();
        renderStatic();
        return;
      }
      if (animating) return;
      animating = true;
      lastFrame = performance.now();
      animationFrame = requestAnimationFrame(renderFrame);
    };

    const onPointerMove = (event) => {
      const rect = stage.getBoundingClientRect();
      targetPointer.x = ((event.clientX - rect.left) / Math.max(width, 1) - 0.5) * 1.1;
      targetPointer.y = ((event.clientY - rect.top) / Math.max(height, 1) - 0.5) * 1.1;
    };

    const onPointerLeave = () => targetPointer.set(0, 0);

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
        syncAnimation();
      },
      { threshold: 0.02 }
    );
    io.observe(stage);

    const ro = new ResizeObserver(() => {
      resize();
      syncAnimation();
    });
    ro.observe(stage);

    const themeObserver = new MutationObserver(() => paintTheme());
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"]
    });

    stage.addEventListener("pointermove", onPointerMove, { passive: true });
    stage.addEventListener("pointerleave", onPointerLeave, { passive: true });
    document.addEventListener("visibilitychange", syncAnimation);
    motionQuery.addEventListener?.("change", syncAnimation);

    paintTheme();
    applyActive(chapterEntries[0]);
    resize();
    stage.classList.remove("is-fallback");
    stage.classList.add("is-ready");
    syncAnimation();

    return disposeScene;
  }

  const boot = () => {
    for (const [node, cleanup] of instances) {
      if (!node.isConnected) {
        cleanup();
        instances.delete(node);
      }
    }

    const stage = document.querySelector(STAGE_SELECTOR);
    if (!stage || stage.dataset.kbAtlasMounted) return;

    const rect = stage.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) {
      if (visibilityObserver) visibilityObserver.disconnect();
      visibilityObserver = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          visibilityObserver?.disconnect();
          visibilityObserver = null;
          scheduleBoot();
        },
        { threshold: 0.01 }
      );
      visibilityObserver.observe(stage);
      return;
    }

    const graph = window[GRAPH_KEY];
    if (!graph) {
      if (dataRetries >= 60) {
        showFallback(stage);
        stage.dataset.kbAtlasMounted = "failed";
        return;
      }
      dataRetries += 1;
      if (!dataScheduled) {
        dataScheduled = true;
        window.setTimeout(() => {
          dataScheduled = false;
          boot();
        }, 100);
      }
      return;
    }

    stage.dataset.kbAtlasMounted = "loading";
    initAtlas(stage, graph)
      .then((cleanup) => {
        instances.set(stage, cleanup);
        stage.dataset.kbAtlasMounted = "ready";
      })
      .catch((error) => {
        console.error("[kb-atlas]", error);
        stage.querySelectorAll(".kb-atlas__canvas, .kb-atlas__labels").forEach((node) => node.remove());
        showFallback(stage);
        stage.dataset.kbAtlasMounted = "failed";
      });
  };

  const scheduleBoot = () => {
    if (bootScheduled) return;
    bootScheduled = true;
    requestAnimationFrame(() => {
      bootScheduled = false;
      boot();
    });
  };

  const observer = new MutationObserver(scheduleBoot);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", scheduleBoot);
  window.addEventListener("load", scheduleBoot);
  boot();
})();
