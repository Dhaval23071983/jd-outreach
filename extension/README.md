# JD Outreach Apply (Chrome extension)

Fills Greenhouse, Lever and Ashby job application forms from JD Outreach: your details, the tailored
CV for that role, a cover letter when the form requires one, and drafted answers to the form's questions.
It never clicks Submit. You read the form and submit it yourself.

## Install (once)
1. In Chrome, open chrome://extensions and turn on **Developer mode** (top right).
2. Click **Load unpacked** and choose this folder: `~/Desktop/jd-outreach/extension`.
3. Fill in the empty answers in `~/Desktop/jd-outreach/profile/apply-profile.json`
   (work authorization, sponsorship, relocation, salary, start date). Anything left empty is
   marked red on the form for you to answer.

## Use
1. Run the job through JD Outreach first, so it has a tailored CV for the role.
2. Keep JD Outreach running on localhost:3040.
3. Open the job's application form. A **JD Outreach** panel appears at the bottom right.
4. Click **Fill application**.
   - Green: filled from your profile.
   - Amber: drafted answer or attached file. Read it.
   - Red: you need to answer it (self-identification, consent, visa, salary, anything not in your facts).
5. Check the whole form and click the site's **Submit** button.
6. Click **I submitted it** in the panel (Greenhouse confirmation pages are detected automatically).
   JD Outreach records the application date and removes the job from your Jobs list.

## Limits
- Workday and Amazon forms aren't supported yet.
- Location search boxes get your city typed in; pick the matching item from the list.
- Forms that forbid AI help (for example Anthropic's) are marked red on those questions. Write them yourself.
- After you edit the extension's files, click the reload icon on its card in chrome://extensions.
