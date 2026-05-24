function createGeoSANeedsAssessmentForm() {
  const form = FormApp.create("GeoSA Cartographic Production Modernization - Needs Assessment");

  form.setDescription([
    "Dear GeoSA team,",
    "",
    "Thank you for the productive discussion. This short questionnaire will help me understand your current cartographic production environment, the main improvements you want to achieve, and the practical constraints that should shape the proposal.",
    "",
    "The goal is to prepare a tailored proposal for a cartographic production modernization program. Potential focus areas include clearer and more consistent map design, stronger cartographic conventions across regions, better integration of statistical information, automation-ready production workflows, and possible support for interactive map products in collaboration with the IT Department.",
    "",
    "Please do not include classified, restricted, or confidential material in this form. If map examples or internal workflows are useful, please share only approved/sanitized examples or provide secure links according to your internal policies."
  ].join("\n"));

  form.setCollectEmail(false);
  form.setLimitOneResponsePerUser(false);
  form.setConfirmationMessage("Thank you. I will review your responses and use them to prepare a tailored proposal covering program structure, delivery format, timeline, deliverables, and financial aspect.");

  addIntro(form);

  const sections = [
    {
      title: "Section 1 - Objectives",
      questions: [
        q(1, "What is the main outcome you want from this collaboration?", "paragraph", true, null, "Please describe, in your own words, what you would like to improve or achieve."),
        q(2, "Which goals matter most? Please select up to 5.", "checkbox", true, [
          "Improve the visual quality of maps",
          "Make maps clearer and easier to interpret",
          "Standardize cartographic conventions across regions",
          "Improve map consistency between teams or regional offices",
          "Improve statistical mapping and data enrichment",
          "Improve ArcGIS Pro production workflows",
          "Automate repetitive map production tasks",
          "Improve Python-based workflows",
          "Develop production templates",
          "Improve quality assurance and map review",
          "Support interactive map products or web applications",
          "Develop internal cartographic guidelines or a style guide",
          "Build staff skills through training",
          "Other"
        ], "Please choose the most important priorities rather than all possible areas."),
        q(3, "What would make this program successful after 3-6 months?", "paragraph", true, null, "Please describe practical outcomes, not only general goals.")
      ]
    },
    {
      title: "Section 2 - Current map production",
      questions: [
        q(4, "What types of maps or products does your team currently produce?", "checkbox", true, [
          "Topographic maps",
          "Administrative / boundary maps",
          "Thematic maps",
          "Statistical maps",
          "Urban maps",
          "Infrastructure maps",
          "Environmental maps",
          "Hazard / risk maps",
          "Terrain / elevation maps",
          "Atlas-style maps",
          "Dashboards or interactive maps",
          "Web maps or map applications",
          "Executive / briefing maps",
          "Public communication maps",
          "Other"
        ]),
        q(5, "Who are the main audiences for these maps?", "checkbox", true, [
          "Internal GeoSA teams",
          "Other government agencies",
          "Decision-makers / executives",
          "Technical specialists",
          "Public users",
          "Researchers / universities",
          "Emergency / operations users",
          "Planning and development users",
          "Other"
        ]),
        q(6, "What are the main output formats today?", "checkbox", true, [
          "Printed maps",
          "PDF maps",
          "Static digital images",
          "Map books / atlas products",
          "ArcGIS Pro layouts",
          "ArcGIS Online / Enterprise web maps",
          "Dashboards",
          "Web applications",
          "Reports and presentations",
          "APIs or data services",
          "Other"
        ]),
        q(7, "Which map series, products, regions, or scales should be used as reference cases for the program?", "paragraph", false, null, "Please mention the most important examples. If approved examples can be shared, provide secure links or send them separately by email.")
      ]
    },
    {
      title: "Section 3 - Main cartographic problems",
      questions: [
        q(8, "What are the biggest current problems with map quality, clarity, or consistency?", "paragraph", true, null, "Examples: crowded maps, unclear legends, inconsistent colors, weak hierarchy, poor labeling, inconsistent regional interpretation, or weak communication of statistical patterns."),
        q(9, "Which map elements are hardest to standardize?", "checkbox", true, [
          "Color palettes",
          "Symbol design",
          "Line weights",
          "Typography / fonts",
          "Label hierarchy",
          "Legend design",
          "Layout templates",
          "Use of statistical information",
          "Classification methods",
          "Basemap / background choices",
          "Regional naming or feature emphasis",
          "Terrain representation",
          "Map purpose / audience definition",
          "Quality review process",
          "Other"
        ]),
        q(10, "Do you currently have a formal cartographic style guide or map production standard?", "multiple", true, [
          "Yes, and it is actively used",
          "Yes, but it is incomplete or inconsistently applied",
          "Informal conventions exist, but not a formal guide",
          "No formal guide exists",
          "Not sure"
        ]),
        q(11, "What does a \"better map\" mean for your department?", "paragraph", true, null, "Please describe the qualities you want: clearer, more authoritative, more standardized, more visually appealing, more data-rich, easier to update, or more suitable for decision-making.")
      ]
    },
    {
      title: "Section 4 - Data, statistics, and workflows",
      questions: [
        q(12, "What statistical information do you use now, or want to integrate better into maps?", "paragraph", true, null, "Please mention themes, indicators, data types, or examples."),
        q(13, "What are the main data or workflow bottlenecks today?", "checkbox", true, [
          "Data is not available in map-ready format",
          "Data is difficult to join to geographic units",
          "Inconsistent geographic boundaries",
          "Unclear denominators or normalization",
          "Classification methods are inconsistent",
          "Metadata or source documentation is incomplete",
          "Data quality varies between regions",
          "Too much manual data preparation",
          "Too much manual map styling or layout work",
          "Limited reusable templates or scripts",
          "Limited quality assurance process",
          "Other"
        ]),
        q(14, "Which tools does your team currently use?", "checkbox", true, [
          "ArcGIS Pro",
          "ArcGIS Enterprise",
          "ArcGIS Online",
          "ArcPy",
          "Python notebooks",
          "Jupyter",
          "QGIS",
          "FME",
          "PostgreSQL / PostGIS",
          "SQL Server / enterprise database",
          "R",
          "Adobe Illustrator",
          "Power BI",
          "Tableau",
          "Web GIS / JavaScript tools",
          "Other"
        ]),
        q(15, "How is Python or ArcGIS Pro currently used in your map production workflow?", "paragraph", false, null, "Please mention examples such as data preparation, geoprocessing, ArcPy, exports, QA checks, notebooks, dashboards, or automation scripts.")
      ]
    },
    {
      title: "Section 5 - Proposed program scope",
      questions: [
        q(16, "Which areas should the program include? Please select up to 5.", "checkbox", true, [
          "Cartographic design principles",
          "Cartographic style guide or standards",
          "Statistical mapping methods",
          "ArcGIS Pro production workflows",
          "Python / ArcPy automation",
          "Reusable map templates",
          "Quality assurance and map review process",
          "Interactive maps or applications",
          "Collaboration between Cartographic and IT departments",
          "Staff training and exercises",
          "Final recommendations roadmap",
          "Other"
        ], "Please choose the areas that should drive the proposal scope."),
        q(17, "What would be the most valuable deliverable from this program?", "multiple", true, [
          "Cartographic guidelines / style guide",
          "Improved map templates",
          "Reusable workflow or automation examples",
          "QA checklist and review process",
          "Training program with exercises",
          "Prototype or reference map products",
          "Roadmap for modernization",
          "Other"
        ]),
        q(18, "Should interactive map or application guidance be included in this program?", "multiple", true, [
          "Yes, include it as a main focus",
          "Yes, include it as a secondary topic",
          "Only discuss what Cartographic should define before IT builds",
          "No, keep this program focused on static/production cartography",
          "Not sure yet"
        ])
      ]
    },
    {
      title: "Section 6 - Delivery, participants, and constraints",
      questions: [
        q(19, "How many participants do you expect, and what roles should they represent?", "paragraph", true, null, "Please include approximate number of participants and roles such as cartographers, GIS specialists, data analysts, Python developers, IT/application developers, or managers."),
        q(20, "What is the expected technical level of participants?", "multiple", true, [
          "Mostly beginner",
          "Mostly intermediate",
          "Mostly advanced",
          "Mixed levels",
          "Not sure"
        ]),
        q(21, "Which delivery format and cadence would work best?", "multiple", true, [
          "Live online program over several weeks",
          "Live online program with one focused session per week",
          "Short live online workshop",
          "Hybrid program",
          "On-site training",
          "Not sure yet"
        ]),
        q(22, "What constraints should be considered when preparing the proposal?", "paragraph", false, null, "Please mention timeline, preferred time windows, software/security restrictions, approved or sanitized example data availability, procurement constraints, or any proposal requirements.")
      ]
    }
  ];

  sections.forEach(function (section) {
    form.addPageBreakItem().setTitle(section.title);
    section.questions.forEach(function (question) {
      addQuestion(form, question);
    });
  });

  Logger.log("Published form URL: " + form.getPublishedUrl());
  Logger.log("Edit form URL: " + form.getEditUrl());
}

function addIntro(form) {
  form.addSectionHeaderItem()
    .setTitle("Purpose")
    .setHelpText("This questionnaire is designed to collect the minimum information needed to scope a tailored proposal for the GeoSA Cartographic Department. Detailed technical decisions can be handled in a follow-up discussion.");

  form.addSectionHeaderItem()
    .setTitle("Suggested Google Forms settings")
    .setHelpText([
      "Collect email addresses: Optional. Turn on only if useful.",
      "Limit to 1 response: Off, unless GeoSA wants one consolidated official response.",
      "File uploads: Off by default. For confidentiality reasons, ask respondents to provide secure links or send approved/sanitized map examples separately by email.",
      "Response type: Ideally one consolidated response from the Cartographic Department lead, with input from GIS and IT colleagues."
    ].join("\n"));
}

function q(number, title, type, required, choices, helpText) {
  return {
    number: number,
    title: title,
    type: type,
    required: required,
    choices: choices || [],
    helpText: helpText || ""
  };
}

function addQuestion(form, question) {
  const title = question.number + ". " + question.title;
  let item;

  if (question.type === "short") {
    item = form.addTextItem();
    item.setTitle(title);
  } else if (question.type === "email") {
    item = form.addTextItem();
    item.setTitle(title);
    item.setValidation(FormApp.createTextValidation().requireTextIsEmail().build());
  } else if (question.type === "paragraph") {
    item = form.addParagraphTextItem();
    item.setTitle(title);
  } else if (question.type === "multiple") {
    item = form.addMultipleChoiceItem();
    item.setTitle(title);
    item.setChoiceValues(question.choices);
  } else if (question.type === "checkbox") {
    item = form.addCheckboxItem();
    item.setTitle(title);
    item.setChoiceValues(question.choices);
  } else if (question.type === "grid") {
    item = form.addGridItem();
    item.setTitle(title);
    item.setRows(question.rows);
    item.setColumns(question.columns);
  } else {
    throw new Error("Unsupported question type: " + question.type);
  }

  if (question.helpText) {
    item.setHelpText(question.helpText);
  }

  item.setRequired(question.required);
}
