Macbeth by William Shakespeare: chapter checks
Chapter Checks by READ FRANCE · version 2026.10.2 · https://outils.vread.fr/chapter-checks/

5 checks, 40 questions, and one one-word reading checkpoint per check, answer key with rationale
and text evidence, rubric for every written answer.

FILES
  macbeth-student-checks.pdf
  macbeth-answer-key.pdf
  macbeth-questions.csv
  macbeth-qti-1.2.zip
  make-google-form.gs
  README.txt
  LICENSE.txt

PRINT
  Print macbeth-student-checks.pdf (US Letter; each check starts on a new page). Keep macbeth-answer-key.pdf for yourself.

CANVAS (QTI 1.2)
  Course > Settings > Import Course Content > Content Type "QTI .zip file" > choose macbeth-qti-1.2.zip.
  Each check becomes one quiz. Multiple-choice items and the reading checkpoint (a one-word short answer) grade
  themselves; the written answer is an essay question (2 points) that you grade with the rubric in the answer key.

SCHOOLOGY
  Schoology imports QTI 1.2 files into a question bank or a test. Use the same ZIP. We have not tested the import
  in a live Schoology account yet: if it fails, write to us and use the CSV meanwhile.

GOOGLE FORMS (one quiz per check, answer key set)
  1. In Google Sheets: File > Import > Upload macbeth-questions.csv ("Replace spreadsheet").
  2. Extensions > Apps Script. Replace the code with the content of make-google-form.gs. Save.
  3. Run the function createQuizzes and accept Google's permission screen (it only creates forms in your Drive).
     To make one check only, type its id (for example act-1) in cell Z1 of the sheet first.
  4. The links of the new forms are written in a new sheet tab named "Forms".

OTHER TOOLS
  macbeth-questions.csv has one row per question: question, options A to D, correct letter and text, points,
  model answer and rubric. Rows of type one_word are the reading checkpoints (number CP, the expected word in
  correct_answer). Most quiz tools that import a spreadsheet can map these columns.

THE TEXT
  Text used: Macbeth by William Shakespeare, Project Gutenberg eBook #1533 (gutenberg.org/ebooks/1533). First published 1623 (First Folio). Questions refer to 5 acts, never to page numbers, so they work with any complete edition.

MISTAKES
  Write to octave@vread.fr (title, check, question number). Corrected files go to every buyer of the title.

Licence: see LICENSE.txt. Not affiliated with the College Board.
