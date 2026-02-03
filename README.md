# xikipedia
Wikipedia as a social media feed

# Try it: [xikipedia.org](https://xikipedia.org/)

## About

Xikipedia is a pseudo social media feed that algorithmically shows you content from [Simple Wikipedia](https://simple.wikipedia.org/). It is made as a demonstration of how even a basic non-ML algorithm with no data from other users can quickly learn what you engage with to suggest you more similar content. No data is collected or shared here, the algorithm runs locally and the data disappears once you refresh or close the tab.

## Generating data

To run Xikipedia, you need the .json file that contains the data required. This repo already has a file for the Simple Wikipedia included, but you can also make your own by replacing the files in the `process_data.py` file with your own [WikiMedia data dumps](https://dumps.wikimedia.org/).

