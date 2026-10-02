"""Visually checked transcriptions of the five pages containing raster text.

The original form images remain authoritative for cell relationships and blanks.
These transcripts preserve all printed labels, repeated response options and scores.
"""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COVER = '''DIAGNOSTIC AND STATISTICAL
MANUAL OF
MENTAL DISORDERS
FIFTH EDITION
TEXT REVISION
DSM-5-TR™
AMERICAN PSYCHIATRIC ASSOCIATION'''
HEADER = '''Clinician Use Only
Numeric scores assigned to each of the items: 1 | 2 | 3 | 4 | 5
Raw Item Score | Raw Domain Score | Average Domain Score
In the last 30 days, how much difficulty did you have in:'''
OPTIONS = 'None | Mild | Moderate | Severe | Extreme or cannot do'


def rows(items):
    return '\n'.join(f'{code} {question} | {OPTIONS}' for code, question in items)


FIRST = '''WHODAS 2.0
World Health Organization Disability Assessment Schedule 2.0
36-item version, self-administered
Patient Name: ____________________ Age: ______ Date: ______
This questionnaire asks about difficulties due to health/mental health conditions. Health conditions include diseases or illnesses, other health problems that may be short or long lasting, injuries, mental or emotional problems, and problems with alcohol or drugs. Think back over the past 30 days and answer these questions thinking about how much difficulty you had doing the following activities. For each question, please circle only one response.
''' + HEADER + '\nUnderstanding and communicating\n' + rows([
    ('D1.1', 'Concentrating on doing something for ten minutes?'),
    ('D1.2', 'Remembering to do important things?'),
    ('D1.3', 'Analyzing and finding solutions to problems in day-to-day life?'),
    ('D1.4', 'Learning a new task, for example, learning how to get to a new place?'),
    ('D1.5', 'Generally understanding what people say?'),
    ('D1.6', 'Starting and maintaining a conversation?'),
]) + '\nRaw Domain Score: ___ / 30 | Average Domain Score: ___ / 5\nGetting around\n' + rows([
    ('D2.1', 'Standing for long periods, such as 30 minutes?'),
    ('D2.2', 'Standing up from sitting down?'),
    ('D2.3', 'Moving around inside your home?'),
    ('D2.4', 'Getting out of your home?'),
    ('D2.5', 'Walking a long distance, such as a kilometer (or equivalent)?'),
]) + '\nRaw Domain Score: ___ / 25 | Average Domain Score: ___ / 5\nSelf-care\n' + rows([
    ('D3.1', 'Washing your whole body?'),
    ('D3.2', 'Getting dressed?'),
    ('D3.3', 'Eating?'),
    ('D3.4', 'Staying by yourself for a few days?'),
]) + '\nRaw Domain Score: ___ / 20 | Average Domain Score: ___ / 5\nGetting along with people\n' + rows([
    ('D4.1', 'Dealing with people you do not know?'),
    ('D4.2', 'Maintaining a friendship?'),
    ('D4.3', 'Getting along with people who are close to you?'),
    ('D4.4', 'Making new friends?'),
    ('D4.5', 'Sexual activities?'),
]) + '\nRaw Domain Score: ___ / 25 | Average Domain Score: ___ / 5'

SECOND = HEADER + '\nLife activities—Household\n' + rows([
    ('D5.1', 'Taking care of your household responsibilities?'),
    ('D5.2', 'Doing most important household tasks well?'),
    ('D5.3', 'Getting all of the household work done that you needed to do?'),
    ('D5.4', 'Getting your household work done as quickly as needed?'),
]) + '''
Raw Domain Score: ___ / 20 | Average Domain Score: ___ / 5
Life activities—School/Work
If you work (paid, non-paid, self-employed) or go to school, complete questions D5.5–D5.8, below.
Otherwise, skip to D6.1.
Because of your health condition, in the past 30 days, how much difficulty did you have in:
''' + rows([
    ('D5.5', 'Your day-to-day work/school?'),
    ('D5.6', 'Doing your most important work/school tasks well?'),
    ('D5.7', 'Getting all of the work done that you need to do?'),
    ('D5.8', 'Getting your work done as quickly as needed?'),
]) + '''
Raw Domain Score: ___ / 20 | Average Domain Score: ___ / 5
Participation in society
In the past 30 days:
''' + rows([
    ('D6.1', 'How much of a problem did you have in joining in community activities (for example, festivities, religious, or other activities) in the same way as anyone else can?'),
    ('D6.2', 'How much of a problem did you have because of barriers or hindrances around you?'),
    ('D6.3', 'How much of a problem did you have living with dignity because of the attitudes and actions of others?'),
]) + '\nD6.4 How much time did you spend on your health condition or its consequences? | None | Some | Moderate | A Lot | Extreme or cannot do\n' + rows([
    ('D6.5', 'How much have you been emotionally affected by your health condition?'),
    ('D6.6', 'How much has your health been a drain on the financial resources of you or your family?'),
    ('D6.7', 'How much of a problem did your family have because of your health problems?'),
    ('D6.8', 'How much of a problem did you have in doing things by yourself for relaxation or pleasure?'),
]) + '''
Raw Domain Score: ___ / 40 | Average Domain Score: ___ / 5
General Disability Score (Total): ___ / 180 | ___ / 5
© World Health Organization, 2012. All rights reserved. Measuring health and disability: manual for WHO Disability Assessment Schedule (WHODAS 2.0), World Health Organization, 2010, Geneva.
The World Health Organization has granted the Publisher permission for the reproduction of this instrument. This material can be reproduced without permission by clinicians for use with their own patients. Any other use, including electronic use, requires written permission from WHO.'''


if __name__ == '__main__':
    front = ROOT / 'book-parts' / 'DSM 5 TR-APA (2022)-1-100.pdf'
    end = ROOT / 'book-parts' / 'DSM 5 TR-APA (2022)-1112-1377.pdf'
    data = {}
    for number, text in {1: COVER, 2: COVER, 6: 'AMERICAN\nPSYCHIATRIC\nASSOCIATION\nAMERICAN\nPSYCHIATRIC\nASSOCIATION\nPUBLISHING', 1122: FIRST, 1123: SECOND}.items():
        data[str(number)] = {'text': text, 'reviewed': True, 'method': 'Visual transcription checked against source-page rendering',
                            'sourceSha256': hashlib.sha256((front if number < 100 else end).read_bytes()).hexdigest(),
                            'lowConfidenceLines': [], 'note': 'Pipes separate table cells; underscores represent blank fields. Original images retain the exact layout.'}
    (ROOT / 'scripts' / 'ocr-reviewed.json').write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
