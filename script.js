document.addEventListener("DOMContentLoaded", () => {

    const isIndex = document.getElementById("examYear") !== null;

    if (isIndex) {

        /******************************************************
         *                index.html 用
         ******************************************************/

        const saved = JSON.parse(localStorage.getItem("lastExam") || "{}");

        if (saved.year) document.getElementById("examYear").value = saved.year;
        if (saved.month) document.getElementById("examMonth").value = saved.month;
        if (saved.subject) document.getElementById("examSubject").value = saved.subject;

        if (saved.schoolType) document.getElementById("schoolType").value = saved.schoolType;

        if (saved.schoolName) {
            const schoolSelect = document.getElementById("schoolSelect");
            schoolSelect.dataset.saved = saved.schoolName;
        }

        const schoolType = document.getElementById("schoolType");
        const schoolSelect = document.getElementById("schoolSelect");
        const btn = document.getElementById("goQuestions");

        let schoolsData = {};

        fetch("data/schools.json")
            .then(res => res.json())
            .then(data => {
                schoolsData = data;

                /**********************
                 * 学校タイプ選択
                 **********************/
                schoolType.addEventListener("change", () => {

                    const type = schoolType.value;
                    schoolSelect.innerHTML = '<option value="">選択してください</option>';

                    if (!type) return;

                    const list = schoolsData[type] || [];

                    list.forEach(s => {
                        const op = document.createElement("option");
                        op.value = s.name;
                        op.textContent = s.name;

                        if(s.isGroup){
                            op.disabled = true;
                            op.style.color = "#0000ff";
                            op.style.fontWeight = "bold";
                        }else{
                            op.value = s.name;
                        }

                        schoolSelect.appendChild(op);
                    });

                    // 保存されていた schoolName を復元
                    if (schoolSelect.dataset.saved) {
                        schoolSelect.value = schoolSelect.dataset.saved;
                        delete schoolSelect.dataset.saved;
                    }
                });

                // ★ 年度を選んだときの科目フィルタリング
                const examYear = document.getElementById("examYear");
                const examSubject = document.getElementById("examSubject");

                examYear.addEventListener("change", () => {
                    const yearVal = examYear.value;

                    // 科目リストを初期化
                    examSubject.innerHTML =
                        '<option value="">選択してください</option>' +
                        '<option value="math">数学</option>' +
                        '<option value="science">理科</option>' +
                        '<option value="social">社会</option>';

                    // ★ 2024 年度なら数学以外を削除
                    if (yearVal === "2024") {
                        examSubject.innerHTML =
                            '<option value="">選択してください</option>' +
                            '<option value="math">数学</option>';
                    }

                    // 保存データがある場合は復活
                    if (saved.subject && (yearVal !== "2024" || saved.subject === "math")) {
                        examSubject.value = saved.subject;
                    }
                });


                // ページ読み込み時、schoolType が保存されていた場合は強制発火
                if (saved.schoolType) {
                    const evt = new Event("change");
                    schoolType.dispatchEvent(evt);
                }

                /**********************
                 * 次へボタン
                 **********************/
                btn.addEventListener("click", () => {
                    const year = document.getElementById("examYear").value;
                    const month = document.getElementById("examMonth").value;
                    const subject = document.getElementById("examSubject").value;
                    const schoolName = schoolSelect.value;

                    if (!year || !month || !subject || !schoolName) {
                        alert("模試情報と志望校をすべて入力してください");
                        return;
                    }

                    // 偏差値を学校データから検索
                    let score = null;
                    Object.values(schoolsData)
                        .flat()
                        .forEach(s => {
                            if (s.name === schoolName) score = s.score;
                        });

                    if (score === null) {
                        alert("志望校名がリストにありません。入力を確認してください。");
                        return;
                    }

                    const params = new URLSearchParams({
                        year,
                        month,
                        subject,
                        schoolScore: score
                    });

                    // 入力内容を localStorage に保存
                    localStorage.setItem("lastExam", JSON.stringify({
                        year,
                        month,
                        subject,
                        schoolName,
                        schoolType: schoolType.value,
                        schoolScore: score
                    }));

                    window.location.href = "result.html?" + params.toString();
                });

            });
        
        // ★ 保存データリセット
        const resetBtn = document.getElementById("resetStorage");
        if (resetBtn) {
            resetBtn.addEventListener("click", () => {
                localStorage.removeItem("lastExam");
                alert("保存データをリセットしました！");
                location.reload();
            });
        }
    }

    /******************************************************
     *                result.html 用
     ******************************************************/
    if (document.getElementById("questionContainer")) {

        const container = document.getElementById("questionContainer");
        const resultContainer = document.getElementById("resultContainer");
        const printBtn = document.getElementById("printBtn");

        const params = new URLSearchParams(location.search);
        const year = params.get("year");
        const month = params.get("month");
        const subject = params.get("subject");
        const schoolScore = parseFloat(params.get("schoolScore"));

        const path = `exams/${year}_${month}/${subject}.json`;

        let sub_name = "数学";
        if(subject == "math"){sub_name = "数学"}
        else if(subject == "science"){sub_name = "理科"}
        else{sub_name = "社会"}

        fetch(path)
            .then(res => res.json())
            .then(data => {
                container.innerHTML = `<h2>${year}年 ${month}月模試：${sub_name}</h2>`;

                data.majorQuestions.forEach(q => {
                    const div = document.createElement("div");
                    div.className = "question-block";

                    div.innerHTML = `<div><strong>大問 ${q.id}</strong></div>`;

                    q.subquestions.forEach(sub => {
                        div.innerHTML += `
                            <div style="margin-top:5px;">
                                小問${sub.no}
                                <div class="radio-group">
                                    <label><input type="radio" name="${q.id}_${sub.no}" value="correct"> 正</label>
                                    <label><input type="radio" name="${q.id}_${sub.no}" value="wrong"> 誤</label>
                                </div>
                            </div>
                        `;
                    });

                    container.appendChild(div);
                });

                const btn = document.createElement("button");
                btn.textContent = "判定する";
                btn.addEventListener("click", () => evaluate(data, schoolScore));
                container.appendChild(btn);
            });

        /**********************
         * 偏差値 → 解いてよい難易度
         **********************/
        function getAllowedDifficulty(score) {
            if (score <= 45) return ["0"];
            if (score <= 50) return ["0", "1"];
            return ["0", "1", "2"];
        }

        /**********************
         * 判定
         **********************/
        async function evaluate(data, schoolScore) {
            await unitNamesLoaded;
            const allowed = getAllowedDifficulty(schoolScore);
            const results = {};
            let allAnswered = true;

            data.majorQuestions.forEach(q => {
                q.subquestions.forEach(sub => {
                    const name = `${q.id}_${sub.no}`;
                    const val = document.querySelector(`input[name="${name}"]:checked`);

                    if (!val) allAnswered = false;

                    // 間違えた & 志望校レベル以下の難易度だけ採用
                    if (val && val.value === "wrong" && allowed.includes(sub.difficulty)) {

                        const units = Array.isArray(sub.unit) ? sub.unit : [sub.unit];

                        units.forEach(u => {
                            if (!results[u]) results[u] = [];
                            results[u].push(`${q.id}-${sub.no}`);
                        });
                    }
                });
            });

            if (!allAnswered) {
                alert("すべての正誤を選択してください");
                return;
            }

            showResult(results);
        }

        /**********************
         * 結果表示
         **********************/

        let unitNames = {};
        const unitNamesLoaded = fetch("data/foresta.json")
            .then(res => res.json())
            .then(data => {
                unitNames = data;
            });


        async function showResult(results) {
            await unitNamesLoaded;
            const list = document.getElementById("resultList");
            list.innerHTML = "";

            const units = Object.keys(results).sort((a, b) => {
                const na = parseInt(a.match(/\d+/));
                const nb = parseInt(b.match(/\d+/));
                return na - nb;
            });

            if (units.length === 0) {
                list.innerHTML = "<p>復習する単元はありません．<br>入試ファイナルを解いて実力をあげよう！</p>";
            } else {
                list.innerHTML += '<h2>以下の単元をFゴールで復習しよう！</h2>';
                units.forEach(unit => {
                    const unitName =
                        unitNames[subject] && unitNames[subject][unit]
                            ? unitNames[subject][unit]
                            : "名称未登録";

                    list.innerHTML += `<h3>・ 単元 ${unit}：${unitName}</h3>`;
                });
            }

            resultContainer.style.display = "block";

            if (printBtn) {
                printBtn.style.display = "block";
                printBtn.onclick = () => {
                    sessionStorage.setItem("reviewUnits", JSON.stringify(results));
                    window.location.href = "review.html?subject=" + subject;
                };
            }
        }
    }

    /******************************************************
     *                review.html 用
     ******************************************************/
    if (document.body.dataset.page === "review") {

        const reviewUnits = JSON.parse(sessionStorage.getItem("reviewUnits") || "{}");
        const container = document.getElementById("reviewContent");

        // ★ URL から科目を取得
        const params = new URLSearchParams(location.search);
        const subject = params.get("subject");

        // ★ foresta.json を読み込む
        fetch("data/foresta.json")
            .then(res => res.json())
            .then(unitNames => {

                if (Object.keys(reviewUnits).length === 0) {
                    container.innerHTML = "<p>復習する単元はありません．<br>入試ファイナルを解いて実力をあげよう！</p>";
                    return;
                }

                container.innerHTML = '<h2>以下の単元をFゴールで復習しよう！</h2>';

                // ★ ソート用の配列を作る
                const sortedUnits = Object.keys(reviewUnits).sort((a, b) => {
                    const na = parseInt(a.match(/\d+/));
                    const nb = parseInt(b.match(/\d+/));
                    return na - nb;
                });

                container.innerHTML = '<h2>以下の単元をFゴールで復習しよう！</h2>';

                // ★ ソートした順でループ
                sortedUnits.forEach(unit => {

                    const unitName =
                        unitNames[subject] && unitNames[subject][unit]
                            ? unitNames[subject][unit]
                            : "（名称未登録）";

                    container.innerHTML += `
                        <h3>・ 単元 ${unit}：${unitName}</h3>
                        <label>
                            ① 復習日：＿＿＿月＿＿＿日
                            <br><br>
                            ② 復習日：＿＿＿月＿＿＿日
                        </label>
                        <hr>
                    `;
                });
            });
    }
});