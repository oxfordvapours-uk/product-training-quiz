(() => {
  "use strict";

  const CONFIG = {
    bankUrl: "question-bank.json",
    saveUrl: "/save",
    minAnswers: 2,
  };
  const state = {
    document: null,
    questions: [],
    quiz: [],
    answers: [],
    index: 0,
    wrong: [],
    mode: "test",
  };
  const $ = (id) => document.getElementById(id);

  function escapeHtml(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;",
        })[c],
    );
  }

  function show(elementOrId, visible = true) {
    const element =
      typeof elementOrId === "string" ? $(elementOrId) : elementOrId;
    if (element) element.classList.toggle("hidden", !visible);
  }

  function setStatus(id, text) {
    const element = $(id);
    if (!element) return;
    element.textContent = text;
    show(element, true);
  }

  function categories() {
    return [
      ...new Set(state.questions.map((q) => q.category).filter(Boolean)),
    ].sort();
  }

  function populateCategorySelect(
    select,
    { includeAll = false, includeNew = false, selected = "" } = {},
  ) {
    if (!select) return;
    select.innerHTML = "";
    if (includeAll) select.add(new Option("All categories", "All"));
    categories().forEach((category) =>
      select.add(new Option(category, category)),
    );
    if (includeNew) select.add(new Option("Add a new category…", "__new__"));
    if (
      selected &&
      [...select.options].some((option) => option.value === selected)
    )
      select.value = selected;
  }

  async function loadBank() {
    const response = await fetch(CONFIG.bankUrl, { cache: "no-store" });
    if (!response.ok)
      throw new Error(`Could not load ${CONFIG.bankUrl} (${response.status}).`);
    const data = await response.json();
    const questions = Array.isArray(data) ? data : data.questions;
    if (!Array.isArray(questions))
      throw new Error("The JSON file has no questions array.");
    state.document = Array.isArray(data) ? { questions } : data;
    state.questions = questions;
    syncDocument();
  }

  function syncDocument() {
    state.document.questions = state.questions;
    state.document.question_count = state.questions.length;
  }

  async function saveBank() {
    syncDocument();
    const response = await fetch(CONFIG.saveUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.document),
    });
    let result = null;
    try {
      result = await response.json();
    } catch {}
    if (!response.ok)
      throw new Error(
        result?.error || result?.message || `Save failed (${response.status}).`,
      );
    return result;
  }

  function nextId() {
    const ids = state.questions
      .map((q) => Number(String(q.id || "").replace(/\D/g, "")))
      .filter(Number.isFinite);
    return `Q${String((ids.length ? Math.max(...ids) : 0) + 1).padStart(3, "0")}`;
  }

  function createAnswerRow({
    value = "",
    radioName = "correct",
    checked = false,
    container,
  }) {
    const row = document.createElement("div");
    row.className = "row answer-row";
    row.innerHTML = `<input type="radio" name="${escapeHtml(radioName)}" ${checked ? "checked" : ""}><input type="text" class="answerText" value="${escapeHtml(value)}" placeholder="Possible answer"><button type="button" class="danger remove">Remove</button>`;
    row.querySelector(".remove").addEventListener("click", () => {
      if (container.querySelectorAll(".answer-row").length <= CONFIG.minAnswers)
        return alert(`At least ${CONFIG.minAnswers} answers are required.`);
      row.remove();
    });
    return row;
  }

  function readQuestionForm(root, label = "Question") {
    const question = root.querySelector(".question, #question")?.value.trim();
    const category = root.querySelector(".category, #category")?.value;
    const explanation =
      root.querySelector(".explanation, #explanation")?.value.trim() || "";
    const rows = [...root.querySelectorAll(".answer-row, #answers .row")];
    const choices = rows
      .map((row) => row.querySelector(".answerText")?.value.trim() || "")
      .filter(Boolean);
    const selected = rows.find(
      (row) => row.querySelector('input[type="radio"]')?.checked,
    );
    if (!question) throw new Error(`${label}: question is blank.`);
    if (choices.length < CONFIG.minAnswers)
      throw new Error(
        `${label}: at least ${CONFIG.minAnswers} answers are required.`,
      );
    if (!selected) throw new Error(`${label}: select the correct answer.`);
    const correct = selected.querySelector(".answerText").value.trim();
    if (!correct) throw new Error(`${label}: the selected answer is blank.`);
    return {
      question,
      category,
      choices,
      answer: choices.indexOf(correct),
      explanation: explanation || correct,
    };
  }

  function shuffle(items) {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  function prepareQuestion(question) {
    const options = question.choices.map((text, i) => ({
      text,
      correct: i === question.answer,
    }));
    shuffle(options);
    return {
      ...question,
      options,
      correctIndex: options.findIndex((option) => option.correct),
    };
  }

  function initQuiz() {
    populateCategorySelect($("category"), { includeAll: true });
    $("questionCount").textContent = state.questions.length;
    $("startBtn").onclick = () => buildQuiz();
    $("prevBtn").onclick = () => {
      if (state.index > 0) {
        state.index--;
        renderQuiz();
      }
    };
    $("nextBtn").onclick = nextQuestion;
    $("againBtn").onclick = resetQuiz;
    $("wrongBtn").onclick = () => {
      if (state.wrong.length) buildQuiz(state.wrong);
    };
  }

  function buildQuiz(source = null) {
    const category = $("category").value;
    const pool =
      source ||
      state.questions.filter(
        (q) => category === "All" || q.category === category,
      );
    const count = Math.min(parseInt($("count").value, 10), pool.length);
    state.quiz = shuffle([...pool])
      .slice(0, count)
      .map(prepareQuestion);
    state.answers = Array(count).fill(null);
    state.index = 0;
    state.mode = $("mode").value;
    show("start", false);
    show("results", false);
    show("quiz", true);
    renderQuiz();
  }

  function renderQuiz() {
    const q = state.quiz[state.index];
    const selected = state.answers[state.index];
    $("counter").textContent =
      `Question ${state.index + 1} of ${state.quiz.length}`;
    $("catPill").textContent = q.category;
    $("modePill").textContent =
      state.mode === "study" ? "Study Mode" : "Test Mode";
    $("bar").style.width = `${((state.index + 1) / state.quiz.length) * 100}%`;
    $("question").textContent = q.question;
    $("choices").innerHTML = "";
    q.options.forEach((option, i) => {
      const button = document.createElement("button");
      button.className = `choice${selected === i ? " selected" : ""}`;
      if (state.mode === "study" && selected !== null) {
        if (i === q.correctIndex) button.className += " reveal-correct";
        else if (i === selected) button.className += " reveal-wrong";
      }
      button.textContent = option.text;
      button.onclick = () => {
        state.answers[state.index] = i;
        renderQuiz();
      };
      $("choices").appendChild(button);
    });
    renderFeedback(q, selected);
    $("prevBtn").disabled = state.index === 0;
    $("nextBtn").textContent =
      state.index === state.quiz.length - 1 ? "Finish" : "Next";
  }

  function renderFeedback(q, selected) {
    const feedback = $("feedback");
    if (state.mode !== "study" || selected === null) {
      feedback.className = "feedback hidden";
      feedback.innerHTML = "";
      return;
    }
    const correct = selected === q.correctIndex;
    feedback.className = `feedback ${correct ? "good" : "bad"}`;
    feedback.innerHTML = `<div class="feedback-title ${correct ? "correct" : "wrong"}">${correct ? "✓ Correct" : "✗ Incorrect"}</div>${correct ? "" : `<div><b>Correct answer:</b> ${escapeHtml(q.options[q.correctIndex].text)}</div>`}<p><b>Explanation:</b> ${escapeHtml(q.explanation)}</p>`;
  }

  function nextQuestion() {
    if (state.answers[state.index] === null)
      return alert("Choose an answer first.");
    if (state.index < state.quiz.length - 1) {
      state.index++;
      renderQuiz();
    } else finishQuiz();
  }

  function finishQuiz() {
    let correct = 0;
    state.wrong = [];
    state.quiz.forEach((q, i) => {
      if (state.answers[i] === q.correctIndex) correct++;
      else {
        const original = state.questions.find((item) => item.id === q.id);
        if (original) state.wrong.push(original);
      }
    });
    const wrong = state.quiz.length - correct;
    const percentage = Math.round((correct / state.quiz.length) * 100);
    show("quiz", false);
    show("results", true);
    $("score").textContent =
      `${correct} / ${state.quiz.length} (${percentage}%)`;
    $("summary").textContent =
      percentage >= 90
        ? "Excellent result."
        : percentage >= 75
          ? "Strong result—review the missed items below."
          : percentage >= 60
            ? "Good start—another round will help reinforce the details."
            : "Review the explanations and try another random set.";
    $("resultTotals").innerHTML =
      `<div class="total-box total-correct">✓ ${correct} correct</div><div class="total-box total-wrong">✗ ${wrong} incorrect</div>`;
    $("review").innerHTML = "";
    state.quiz.forEach((q, i) => {
      const ok = state.answers[i] === q.correctIndex;
      const chosen = q.options[state.answers[i]].text;
      const correctText = q.options[q.correctIndex].text;
      const item = document.createElement("div");
      item.className = `review ${ok ? "review-correct" : "review-wrong"}`;
      item.innerHTML = `<div class="status ${ok ? "correct" : "wrong"}">${ok ? "✓ CORRECT" : "✗ INCORRECT"}</div><strong class="review-question">${escapeHtml(q.question)}</strong><div class="answer-line ${ok ? "your-correct" : "your-wrong"}"><b>Your answer:</b> ${escapeHtml(chosen)}</div>${ok ? "" : `<div class="answer-line correct-answer"><b>Correct answer:</b> ${escapeHtml(correctText)}</div>`}<p class="muted"><b>Explanation:</b> ${escapeHtml(q.explanation)}</p><span class="pill">${escapeHtml(q.category)}</span>`;
      $("review").appendChild(item);
    });
    $("wrongBtn").disabled = state.wrong.length === 0;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetQuiz() {
    show("results", false);
    show("start", true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function initAdd() {
    populateCategorySelect($("category"), { includeNew: true });
    clearAddForm();
    $("addAnswerBtn").onclick = () => addAddAnswer();
    $("clearBtn").onclick = clearAddForm;
    $("saveBtn").onclick = () =>
      saveNewQuestion().catch((error) => alert(error.message));
  }

  function addAddAnswer(value = "", checked = false) {
    const container = $("answers");
    container.appendChild(
      createAnswerRow({ value, checked, radioName: "correct", container }),
    );
  }

  function clearAddForm() {
    $("question").value = "";
    $("explanation").value = "";
    $("answers").innerHTML = "";
    for (let i = 0; i < CONFIG.minAnswers; i++) addAddAnswer("", i === 0);
  }

  async function saveNewQuestion() {
    let category = $("category").value;
    if (category === "__new__") {
      category = prompt("Enter the new category name:");
      if (!category?.trim()) return;
      category = category.trim();
    }
    const question = {
      id: nextId(),
      ...readQuestionForm($("formCard"), "New question"),
      category,
      source: "Added with question editor",
    };
    state.questions.push(question);
    $("saveBtn").disabled = true;
    $("saveBtn").textContent = "Saving…";
    try {
      await saveBank();
      populateCategorySelect($("category"), {
        includeNew: true,
        selected: category,
      });
      clearAddForm();
      setStatus(
        "status",
        `${question.id} saved. The bank now contains ${state.questions.length} questions.`,
      );
    } catch (error) {
      state.questions.pop();
      throw error;
    } finally {
      $("saveBtn").disabled = false;
      $("saveBtn").textContent = "Add question and save JSON";
    }
  }

  function initEdit() {
    setStatus(
      "fileInfo",
      `${CONFIG.bankUrl} loaded — ${state.questions.length} questions`,
    );
    show("editor", true);
    $("search").oninput = renderEditor;
    $("saveAllBtn").onclick = () =>
      saveAllEdits().catch((error) => alert(error.message));
    renderEditor();
  }

  function renderEditor() {
    const term = $("search").value.trim().toLowerCase();
    $("questions").innerHTML = "";
    let shown = 0;
    state.questions.forEach((q, index) => {
      const haystack = [q.id, q.question, q.category, ...(q.choices || [])]
        .join(" ")
        .toLowerCase();
      if (term && !haystack.includes(term)) return;
      shown++;
      const card = document.createElement("div");
      card.className = "card question-card";
      card.dataset.index = index;
      card.innerHTML = `<div class="header"><strong>${escapeHtml(q.id)}</strong><button type="button" class="danger delete">Delete question</button></div><label>Category</label><select class="category"></select><label>Question</label><textarea class="question">${escapeHtml(q.question)}</textarea><label>Possible answers</label><div class="answers"></div><button type="button" class="secondary add">Add another possible answer</button><label>Explanation</label><textarea class="explanation">${escapeHtml(q.explanation || "")}</textarea><div class="actions"><button type="button" class="saveOne">Keep this edit</button></div>`;
      populateCategorySelect(card.querySelector(".category"), {
        selected: q.category,
      });
      const answerContainer = card.querySelector(".answers");
      (q.choices || []).forEach((choice, i) =>
        answerContainer.appendChild(
          createAnswerRow({
            value: choice,
            checked: i === q.answer,
            radioName: `correct-${index}`,
            container: answerContainer,
          }),
        ),
      );
      card.querySelector(".add").onclick = () =>
        answerContainer.appendChild(
          createAnswerRow({
            radioName: `correct-${index}`,
            container: answerContainer,
          }),
        );
      card.querySelector(".saveOne").onclick = () => {
        try {
          updateQuestion(card);
          alert(
            `${q.id} updated in memory. Click Save all changes to write the file.`,
          );
        } catch (error) {
          alert(error.message);
        }
      };
      card.querySelector(".delete").onclick = () => {
        if (confirm(`Delete ${q.id}?`)) {
          state.questions.splice(index, 1);
          renderEditor();
        }
      };
      $("questions").appendChild(card);
    });
    $("count").textContent =
      `Showing ${shown} of ${state.questions.length} questions`;
  }

  function updateQuestion(card) {
    const question = state.questions[Number(card.dataset.index)];
    Object.assign(question, readQuestionForm(card, question.id));
  }

  async function saveAllEdits() {
    document.querySelectorAll(".question-card").forEach(updateQuestion);
    await saveBank();
    setStatus(
      "fileInfo",
      `Saved ${state.questions.length} questions to ${CONFIG.bankUrl}`,
    );
  }

  function showLoadError(error) {
    document.body.innerHTML = `<div style="max-width:700px;margin:60px auto;font-family:Arial;padding:30px;border:2px solid #c00;border-radius:12px"><h2>Unable to load question bank</h2><p>${escapeHtml(error.message)}</p></div>`;
  }

  async function initialise() {
    await loadBank();
    const page = document.body.dataset.page;
    if (page === "quiz") initQuiz();
    if (page === "add") initAdd();
    if (page === "edit") initEdit();
  }

  initialise().catch((error) => {
    console.error(error);
    showLoadError(error);
  });
})();
