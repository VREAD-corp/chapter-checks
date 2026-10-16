/**
 * Chapter Checks by READ FRANCE: turn the questions CSV into Google Forms quizzes, one per check.
 *
 * 1. In Google Sheets: File > Import > Upload <title>-questions.csv ("Replace spreadsheet").
 * 2. Extensions > Apps Script, paste this file, save, run createQuizzes, accept the permission screen.
 *    Optional: type one check id (for example act-1) in cell Z1 of the sheet to make that check only.
 * 3. The links are written in a sheet tab named "Forms".
 *
 * Multiple-choice items get their answer key and 1 point; the reading checkpoint (one word from the text) is a
 * short-answer item worth 1 point, with the expected word in the answer key PDF (Google Forms does not let a script
 * set a short-answer key: mark it in the Responses tab); the written answer is a paragraph item worth 2 points that
 * you grade with the rubric of the answer key PDF. Nothing is sent anywhere: the forms are created in your
 * own Google Drive, and this script reads only the active spreadsheet.
 * © 2026 READ FRANCE SAS. Licensed with the questions to the purchasing teacher or school.
 */
function createQuizzes() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheets()[0];
  var values = sheet.getDataRange().getValues();
  var head = values[0].map(function (h) { return String(h).replace(/^﻿/, '').trim(); });
  var col = {};
  head.forEach(function (h, i) { col[h] = i; });
  ['title', 'check_id', 'check', 'type', 'points', 'question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_letter']
    .forEach(function (k) { if (!(k in col)) throw new Error('Column "' + k + '" not found: import the questions CSV first.'); });
  var only = String(sheet.getRange('Z1').getValue() || '').trim();

  var checks = [], byId = {};
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var id = String(row[col.check_id] || '').trim();
    if (!id || (only && id !== only)) continue;
    if (!byId[id]) { byId[id] = { id: id, label: row[col.check], title: row[col.title], rows: [] }; checks.push(byId[id]); }
    byId[id].rows.push(row);
  }
  if (!checks.length) throw new Error(only ? 'No question for check "' + only + '" (cell Z1).' : 'No question found.');

  var out = ss.getSheetByName('Forms') || ss.insertSheet('Forms');
  if (out.getLastRow() === 0) out.appendRow(['check', 'questions', 'edit link', 'student link']);
  checks.forEach(function (c) {
    var form = FormApp.create(c.title + ': ' + c.label + ' check');
    form.setIsQuiz(true);
    form.setDescription('Answer from your reading of ' + c.label + '. Choose the best answer; write two or three sentences for the last question.');
    form.addTextItem().setTitle('Your name').setRequired(true);
    var n = 0;
    c.rows.forEach(function (row) {
      if (row[col.type] === 'one_word') {
        form.addTextItem().setTitle('Reading checkpoint. ' + row[col.question] + ' (one word from the text)')
          .setPoints(Number(row[col.points]) || 1).setRequired(true);
        return;
      }
      n++;
      var title = n + '. ' + row[col.question];
      if (row[col.type] === 'multiple_choice') {
        var item = form.addMultipleChoiceItem().setTitle(title).setPoints(Number(row[col.points]) || 1).setRequired(true);
        var key = String(row[col.correct_letter]).trim().toUpperCase();
        item.setChoices(['a', 'b', 'c', 'd'].map(function (l) {
          return item.createChoice(String(row[col['option_' + l]]), l.toUpperCase() === key);
        }));
      } else {
        form.addParagraphTextItem().setTitle(title).setPoints(Number(row[col.points]) || 2).setRequired(true);
      }
    });
    out.appendRow([c.label, c.rows.length, form.getEditUrl(), form.getPublishedUrl()]);
  });
  SpreadsheetApp.getUi && SpreadsheetApp.getActive().toast(checks.length + ' quiz(zes) created. Links in the "Forms" tab.');
}
