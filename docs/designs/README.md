# Design Specs

This folder contains editable HTML spec mocks that mimic the provided terminal screenshots.

# Scan.htm

`shrike scan` dashboard 

keyboard navigation 
- LEFT RIGHT arrow - move to previous / next check within the section. When at the last check tight arrow goes to first item in next section.
- UP DOWN arrow & PgUp PgDown - scroll the report, arrows line by line
- key D or (Enter *When in list view*) changes list view to details and displays highlighted check
- key L or (Enter *when in detail view*) changes details view into list and highlights the current check

app shouldn't exit after scan (when in ui mode) but stay in ui to browse the report.

[esc] exits the app
[f1] displays help with all the keyboard keys

current section is preceded with > character

the default view is as in the design 
- Failed checks as details
- then inconclusive 
- then passed

the report should fill whole terminal